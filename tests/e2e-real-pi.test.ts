/**
 * End-to-end tests against the real pi runtime.
 *
 * Everything here except the model is pi's own code: the real extension loader
 * (jiti, loading `src/index.ts` exactly as `pi install` would), the real tool
 * registry and agent loop, the real session store and branch replay, the real
 * `context`/`before_agent_start` dispatch, and the real `ctx.ui` plumbing.
 *
 * Only two things are doubles, and both are unavoidable rather than convenient:
 *
 * - The model. A scripted provider is registered through the documented
 *   `pi.registerProvider({ streamSimple })` API, so pi builds the request for
 *   real and hands us the exact `Context` it would have sent. That makes the stub
 *   the best available observation point: assertions below read the real system
 *   prompt and the real message list.
 * - The terminal. There is no TTY in a test runner, so `uiContext` is a recorder
 *   that mimics `InteractiveMode.setExtensionWidget`. pi's extension runner still
 *   delivers it as `ctx.ui`, and `hasUI`/`mode` gating is exercised for real.
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { AssistantMessage, Context, Model } from "@earendil-works/pi-ai";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import {
  createAgentSession,
  DefaultResourceLoader,
  type ExtensionAPI,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __resetStore } from "../src/store.js";
import { WIDGET_KEY } from "../src/types.js";

const EXTENSION_PATH = resolve(process.cwd(), "src/index.ts");
const SCRIPT_API = "pi-todo-e2e-scripted";
const PROVIDER = "pi-todo-e2e";
const MODEL_ID = "scripted";

type ScriptedTurn = {
  text?: string;
  toolCalls?: Array<{ name: string; args: unknown }>;
};

interface RecordedRequest {
  systemPrompt: string;
  messages: Context["messages"];
  toolNames: string[];
}

interface WidgetRecord {
  kind: "factory" | "lines" | "clear";
  lines?: string[];
  render?: (width: number) => string[];
  invalidate?: () => void;
}

const identityTheme = {
  fg: (_color: string, text: string) => text,
  bg: (_color: string, text: string) => text,
  bold: (text: string) => text,
  italic: (text: string) => text,
  strikethrough: (text: string) => text,
};

function scriptedStream(
  model: Model<string>,
  context: Context,
  script: ScriptedTurn[],
  record: (r: RecordedRequest) => void,
) {
  record({
    systemPrompt: context.systemPrompt ?? "",
    messages: structuredClone(context.messages),
    toolNames: (context.tools ?? []).map((tool) => tool.name),
  });

  // An exhausted script ends the run with plain text instead of hanging.
  const turn = script.shift() ?? { text: "ok" };
  const stream = createAssistantMessageEventStream();
  const output: AssistantMessage = {
    role: "assistant",
    content: [],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: {
      input: 10,
      output: 5,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 15,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  };

  void (async () => {
    stream.push({ type: "start", partial: output });

    if (turn.text) {
      output.content.push({ type: "text", text: turn.text });
      const contentIndex = output.content.length - 1;
      stream.push({ type: "text_start", contentIndex, partial: output });
      stream.push({ type: "text_delta", contentIndex, delta: turn.text, partial: output });
      stream.push({ type: "text_end", contentIndex, content: turn.text, partial: output });
    }

    for (const [index, call] of (turn.toolCalls ?? []).entries()) {
      const toolCall = {
        type: "toolCall" as const,
        id: `e2e-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
        name: call.name,
        arguments: call.args as Record<string, unknown>,
      };
      output.content.push(toolCall);
      const contentIndex = output.content.length - 1;
      stream.push({ type: "toolcall_start", contentIndex, partial: output });
      stream.push({
        type: "toolcall_delta",
        contentIndex,
        delta: JSON.stringify(call.args),
        partial: output,
      });
      stream.push({ type: "toolcall_end", contentIndex, toolCall, partial: output });
    }

    output.stopReason = (turn.toolCalls?.length ?? 0) > 0 ? "toolUse" : "stop";
    stream.push({ type: "done", reason: output.stopReason, message: output });
    stream.end();
  })();

  return stream;
}

async function startHarness(
  options: {
    mode?: "tui" | "rpc";
    sessionManager?: SessionManager;
    /** Written to the temp agentDir as settings.json before pi reads it. */
    settings?: Record<string, unknown>;
  } = {},
) {
  const mode = options.mode ?? "tui";
  const script: ScriptedTurn[] = [];
  const requests: RecordedRequest[] = [];
  const widgets: WidgetRecord[] = [];
  const statuses: Array<string | undefined> = [];
  const notifications: string[] = [];
  let confirmAnswer = true;
  let liveWidget: WidgetRecord | undefined;

  const dir = await mkdtemp(join(tmpdir(), "pi-todo-e2e-"));
  if (options.settings) {
    await writeFile(join(dir, "settings.json"), JSON.stringify(options.settings), "utf8");
  }

  const harnessExtension = (pi: ExtensionAPI) => {
    pi.registerProvider(PROVIDER, {
      name: "Scripted",
      baseUrl: "http://127.0.0.1:9/unused",
      apiKey: "test-key",
      api: SCRIPT_API,
      models: [
        {
          id: MODEL_ID,
          name: "Scripted",
          reasoning: false,
          input: ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 200_000,
          maxTokens: 8192,
        },
      ],
      streamSimple: (model, context) => scriptedStream(model, context, script, (r) => requests.push(r)),
    });

    // A neutral tool, so turns that are not todo turns still produce tool results
    // and advance the reminder cadence the way real work would.
    pi.registerTool({
      name: "e2e_noop",
      label: "Noop",
      description: "Does nothing; used to advance turns.",
      parameters: Type.Object({}),
      async execute() {
        return { content: [{ type: "text", text: "noop" }], details: {} };
      },
    });
  };

  // Hermetic model runtime: credentials and model catalog live in the temp dir,
  // and no network refresh is allowed, so tests never touch the real config.
  const modelRuntime = await ModelRuntime.create({
    authPath: join(dir, "auth.json"),
    modelsPath: null,
    modelsStorePath: join(dir, "models-store.json"),
    allowModelNetwork: false,
    refreshOnCreate: false,
  });
  const resourceLoader = new DefaultResourceLoader({
    cwd: dir,
    agentDir: dir,
    additionalExtensionPaths: [EXTENSION_PATH],
    extensionFactories: [harnessExtension],
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });
  await resourceLoader.reload();

  const sessionManager = options.sessionManager ?? SessionManager.inMemory();
  const { session, extensionsResult } = await createAgentSession({
    cwd: dir,
    agentDir: dir,
    resourceLoader,
    sessionManager,
    modelRuntime,
  });

  // Every test in this file is also a "the extension loads cleanly" test: pi
  // reports an import or factory failure here rather than throwing.
  if (extensionsResult.errors.length > 0) {
    throw new Error(
      `pi reported extension load errors: ${extensionsResult.errors
        .map((e) => `${e.path}: ${e.error}`)
        .join("; ")}`,
    );
  }

  const uiContext = {
    setWidget(key: string, content: unknown) {
      if (key !== WIDGET_KEY) return;
      if (content === undefined) {
        widgets.push({ kind: "clear" });
        liveWidget = undefined;
        return;
      }
      if (Array.isArray(content)) {
        const record: WidgetRecord = { kind: "lines", lines: content as string[] };
        widgets.push(record);
        liveWidget = record;
        return;
      }
      const factory = content as (
        tui: unknown,
        theme: unknown,
      ) => {
        render(width: number): string[];
        invalidate?: () => void;
      };
      const component = factory({ requestRender: () => {} }, identityTheme);
      const record: WidgetRecord = {
        kind: "factory",
        render: (width) => component.render(width),
        invalidate: () => component.invalidate?.(),
      };
      widgets.push(record);
      liveWidget = record;
    },
    setStatus(_key: string, text?: string) {
      statuses.push(text);
    },
    notify(message: string) {
      notifications.push(message);
    },
    async confirm() {
      return confirmAnswer;
    },
    async custom<T>(
      factory: (tui: unknown, theme: unknown, keybindings: unknown, done: (v: T) => void) => unknown,
    ) {
      let resolved: T | undefined;
      const component = factory({ requestRender: () => {} }, identityTheme, {}, (value) => {
        resolved = value;
      }) as { render(width: number): string[] };
      notifications.push(component.render(80).join("\n"));
      return resolved;
    },
    setTitle() {},
    setEditorText() {},
    getEditorText: () => "",
    theme: identityTheme,
  };

  await session.bindExtensions({ uiContext: uiContext as never, mode });

  const model = modelRuntime.getModel(PROVIDER, MODEL_ID);
  if (!model) throw new Error("scripted model was not registered by the harness extension");
  await session.setModel(model);

  return {
    session,
    sessionManager,
    script,
    requests,
    widgets,
    statuses,
    notifications,
    setConfirmAnswer: (value: boolean) => {
      confirmAnswer = value;
    },
    /** Most recent widget payload still on screen, if any. */
    currentWidget: () => liveWidget,
    widgetLines: (): string[] => {
      if (!liveWidget) return [];
      return liveWidget.kind === "lines" ? (liveWidget.lines ?? []) : (liveWidget.render?.(70) ?? []);
    },
    isOverlayVisible: () => liveWidget !== undefined,
    async dispose() {
      session.dispose();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

type Harness = Awaited<ReturnType<typeof startHarness>>;

const openList = (items: Array<[string, string]>) => ({
  todos: items.map(([content, status]) => ({ content, status, priority: "high" })),
});

let harness: Harness | undefined;

beforeEach(() => __resetStore());

afterEach(async () => {
  await harness?.dispose();
  harness = undefined;
});

describe("real pi runtime: tools and persistence", () => {
  it("registers the tools and keeps diagnostics out of the model's tool list", async () => {
    harness = await startHarness();
    harness.script.push({ text: "hello" });
    await harness.session.prompt("hi");

    const [request] = harness.requests;
    expect(request.toolNames).toContain("todo_write");
    expect(request.toolNames).toContain("todo_update");
    expect(request.toolNames).toContain("todo_read");
    // Diagnostics are a command now; paying for its schema on every request was
    // the point of moving it.
    expect(request.toolNames).not.toContain("todo_diagnose");
  });

  it("executes a real todo_write and shows the overlay through ctx.ui", async () => {
    harness = await startHarness();
    harness.script.push({
      text: "planning",
      toolCalls: [
        {
          name: "todo_write",
          args: openList([
            ["wire overlay", "in_progress"],
            ["write docs", "pending"],
          ]),
        },
      ],
    });
    await harness.session.prompt("implement the overlay and then write the docs for it");

    expect(harness.isOverlayVisible()).toBe(true);
    expect(harness.currentWidget()?.kind).toBe("factory");
    const rendered = harness.widgetLines().join("\n");
    expect(rendered).toContain("Updated Plan");
    expect(rendered).toContain("wire overlay");
    expect(rendered).toContain("write docs");
    expect(harness.statuses.at(-1)).toBe("todos 0/2");
  });

  it("hides the overlay after the plan is finished, even once a theme change invalidated it", async () => {
    harness = await startHarness();
    harness.script.push({
      toolCalls: [{ name: "todo_write", args: openList([["wire overlay", "in_progress"]]) }],
    });
    await harness.session.prompt("implement the overlay module for this project");
    expect(harness.isOverlayVisible()).toBe(true);

    // What pi does on a theme change: ui.invalidate() reaches every widget.
    harness.currentWidget()?.invalidate?.();

    harness.script.push({
      toolCalls: [
        {
          name: "todo_write",
          args: { todos: [{ content: "wire overlay", status: "completed", priority: "high" }] },
        },
      ],
    });
    await harness.session.prompt("done, mark it finished");

    expect(harness.isOverlayVisible()).toBe(false);
    expect(harness.widgets.at(-1)?.kind).toBe("clear");
    expect(harness.statuses.at(-1)).toBeUndefined();
  });

  it("keeps a write and a read in the same parallel batch consistent", async () => {
    // What is actually guaranteed here is mutual exclusion: every mutation and
    // read runs inside withStoreLock, so a sibling read can never observe a
    // half-applied write. Relative ordering within a batch is pi's business and
    // is deliberately not asserted — this test would pass either way, and
    // claiming otherwise would make it a test that proves nothing.
    harness = await startHarness();
    harness.script.push({
      toolCalls: [
        {
          name: "todo_write",
          args: openList([
            ["first task", "in_progress"],
            ["second task", "pending"],
          ]),
        },
        { name: "todo_read", args: {} },
      ],
    });
    await harness.session.prompt("build the feature and then check the plan");

    const readResult = harness.session.messages.find(
      (message) => (message as { role?: string; toolName?: string }).toolName === "todo_read",
    ) as { content?: Array<{ text?: string }> } | undefined;
    const text = readResult?.content?.map((c) => c.text ?? "").join("\n") ?? "";

    expect(text).toContain("first task");
    expect(text).toContain("second task");
    expect(text).toMatch(/t1|t2/);
    // One representation only: no second JSON copy of the same list.
    expect(text).not.toContain('"status"');
  });

  it("recovers todo state from the durable branch in a fresh session", async () => {
    const sessionManager = SessionManager.inMemory();
    harness = await startHarness({ sessionManager });
    harness.script.push({
      toolCalls: [
        {
          name: "todo_write",
          args: openList([
            ["persisted task", "in_progress"],
            ["later task", "pending"],
          ]),
        },
      ],
    });
    await harness.session.prompt("implement the persistence layer for this project");
    const idsBefore = harness.widgetLines().join("\n");
    expect(idsBefore).toContain("persisted task");

    await harness.dispose();
    __resetStore();

    // A second runtime over the same branch: this is what /reload and a restart do.
    harness = await startHarness({ sessionManager });
    expect(harness.isOverlayVisible()).toBe(true);
    const replayed = harness.widgetLines().join("\n");
    expect(replayed).toContain("persisted task");
    expect(replayed).toContain("later task");
  });

  it("survives a real compaction", async () => {
    // The README promises this, and until now it was only covered by a fake host
    // pushing a synthetic compaction entry. Here pi runs its own compaction,
    // including the summarising model call.
    //
    // Scope, stated honestly: this proves the promise (state survives), not that
    // the `session_compact` handler is what makes it survive. Removing that
    // handler leaves this test passing, because compaction adds an entry rather
    // than removing branch entries, so a replay is not strictly required. The
    // handler stays as a defence for the day that changes; the test that does
    // discriminate is the tree-navigation one below, which fails without its
    // handler.
    // keepRecentTokens defaults to 20k, which a scripted conversation never
    // reaches, so pi would decline to compact at all. Lowering it is
    // configuration, not stubbing — the compaction itself is entirely pi's.
    harness = await startHarness({ settings: { compaction: { keepRecentTokens: 100 } } });
    harness.script.push({
      toolCalls: [
        {
          name: "todo_write",
          args: openList([
            ["survive compaction", "in_progress"],
            ["after", "pending"],
          ]),
        },
      ],
    });
    await harness.session.prompt("implement the compaction survival feature in this project");
    expect(harness.isOverlayVisible()).toBe(true);

    // pi declines to compact a session that is too small, so give it real history.
    for (let i = 0; i < 6; i++) {
      harness.script.push({ toolCalls: [{ name: "e2e_noop", args: {} }] });
      harness.script.push({ text: `working on step ${i}` });
      await harness.session.prompt(`continue with step ${i} of the implementation`);
    }

    harness.script.push({ text: "summary of the conversation so far" });
    await harness.session.compact();

    // Prove pi really compacted rather than quietly doing nothing.
    const compactionEntries = harness.sessionManager
      .getEntries()
      .filter((entry) => (entry as { type?: string }).type === "compaction");
    expect(compactionEntries).toHaveLength(1);

    const lines = harness.widgetLines().join("\n");
    expect(lines).toContain("survive compaction");
    expect(lines).toContain("after");

    // And the model still sees the right list on the next turn.
    harness.script.push({ toolCalls: [{ name: "todo_read", args: {} }] });
    harness.script.push({ text: "still there" });
    await harness.session.prompt("check the plan again");
    const read = harness.session.messages
      .filter((message) => (message as { toolName?: string }).toolName === "todo_read")
      .at(-1) as { content?: Array<{ text?: string }> };
    expect(read.content?.[0]?.text).toContain("survive compaction");
  });

  it("reverts to the earlier list when navigating back through the tree", async () => {
    // This is the whole reason state lives in tool results and branch entries:
    // moving the leaf backwards must move the todo list with it.
    harness = await startHarness();
    harness.script.push({
      toolCalls: [{ name: "todo_write", args: openList([["first plan", "in_progress"]]) }],
    });
    await harness.session.prompt("implement the first plan in this project");

    const firstStateEntry = harness.sessionManager
      .getEntries()
      .filter(
        (entry) =>
          (entry as { type?: string; customType?: string }).type === "custom" &&
          (entry as { customType?: string }).customType === "pi-todo.state",
      )
      .at(-1) as { id: string } | undefined;
    expect(firstStateEntry?.id).toBeTruthy();

    harness.script.push({
      toolCalls: [
        {
          name: "todo_write",
          args: openList([
            ["first plan", "completed"],
            ["second plan", "in_progress"],
          ]),
        },
      ],
    });
    await harness.session.prompt("now implement the second plan in this project");
    expect(harness.widgetLines().join("\n")).toContain("second plan");

    harness.script.push({ text: "branch summary" });
    const result = await harness.session.navigateTree(firstStateEntry!.id, { summarize: false });
    expect(result.cancelled).toBe(false);

    const afterNav = harness.widgetLines().join("\n");
    expect(afterNav).toContain("first plan");
    expect(afterNav).not.toContain("second plan");
  });

  it("accepts a payload that only prepareArguments can rescue", async () => {
    harness = await startHarness();
    harness.script.push({
      toolCalls: [
        {
          name: "todo_write",
          args: { todos: [{ text: "coerced task", status: "doing", priority: "P0" }] },
        },
      ],
    });
    await harness.session.prompt("refactor this codebase and add the missing tests");

    const toolResult = harness.session.messages.find(
      (message) => (message as { toolName?: string }).toolName === "todo_write",
    ) as {
      details?: { todos?: Array<{ content: string; status: string; priority: string }>; error?: string };
    };

    expect(toolResult.details?.error).toBeUndefined();
    expect(toolResult.details?.todos?.[0]).toMatchObject({
      content: "coerced task",
      status: "in_progress",
      priority: "high",
    });
  });
});

describe("real pi runtime: prompt and context economy", () => {
  it("never changes the system prompt between turns, whatever the user says", async () => {
    // pi renders tools -> system -> messages and the provider caches that prefix,
    // so any per-turn system prompt edit invalidates the whole cached history.
    harness = await startHarness();
    const prompts = [
      "audit this codebase and fix everything you find",
      "ok",
      "done",
      "thanks",
      "now refactor the overlay module and update the docs",
    ];
    for (const prompt of prompts) {
      harness.script.push({ text: "ack" });
      await harness.session.prompt(prompt);
    }

    expect(harness.requests.length).toBeGreaterThanOrEqual(prompts.length);
    const unique = new Set(harness.requests.map((r) => r.systemPrompt));
    expect(unique.size).toBe(1);
  });

  it("still reaches the model with its guidance, via the stable prompt surfaces", async () => {
    harness = await startHarness();
    harness.script.push({ text: "ack" });
    await harness.session.prompt("plan and implement the feature across these modules");

    const { systemPrompt } = harness.requests[0];
    // promptSnippet -> Available tools, promptGuidelines -> Guidelines.
    expect(systemPrompt).toContain("Replace the session todo list");
    expect(systemPrompt).toMatch(/Use todo_write to plan and track work/);
    expect(systemPrompt).toMatch(/Keep exactly one todo in_progress/);
  });

  it("delivers the cold-start nudge as a tail message, not as system prompt text", async () => {
    harness = await startHarness();
    harness.script.push({ text: "ack" });
    await harness.session.prompt("audit this whole repository and report what needs optimising");

    const { systemPrompt, messages } = harness.requests[0];
    expect(systemPrompt).not.toContain("system-reminder");
    const last = messages.at(-1) as { role: string; content: Array<{ type: string; text: string }> };
    expect(last.role).toBe("user");
    expect(last.content[0].text).toContain("<system-reminder>");
    expect(last.content[0].text).toContain("consider creating a todo list");
  });

  it("injects the idle reminder once open work goes untouched, then re-arms it", async () => {
    harness = await startHarness();
    harness.script.push({
      toolCalls: [{ name: "todo_write", args: openList([["long running task", "in_progress"]]) }],
    });
    await harness.session.prompt("implement the long running task in this project");

    const reminderCount = () =>
      harness!.requests.filter((request) => {
        const last = request.messages.at(-1) as { content?: Array<{ text?: string }> } | undefined;
        return (last?.content?.[0]?.text ?? "").includes("haven't been used recently");
      }).length;

    expect(reminderCount()).toBe(0);

    // Each prompt is one turn with a non-todo tool result; the reminder is due
    // after REMINDER_INTERVAL of them.
    for (let i = 0; i < 6; i++) {
      harness.script.push({ toolCalls: [{ name: "e2e_noop", args: {} }] });
      harness.script.push({ text: "still working" });
      await harness.session.prompt(`step ${i}: keep working on the implementation`);
    }
    const afterFirstWindow = reminderCount();
    expect(afterFirstWindow).toBeGreaterThanOrEqual(1);

    for (let i = 0; i < 6; i++) {
      harness.script.push({ toolCalls: [{ name: "e2e_noop", args: {} }] });
      harness.script.push({ text: "still working" });
      await harness.session.prompt(`step ${i + 6}: keep working on the implementation`);
    }
    // Ignoring a reminder must not silence the extension for the rest of the session.
    expect(reminderCount()).toBeGreaterThan(afterFirstWindow);
  });
});

describe("real pi runtime: user-facing commands", () => {
  it("shows every todo, including finished ones, via /todos", async () => {
    harness = await startHarness();
    harness.script.push({
      toolCalls: [
        {
          name: "todo_write",
          args: {
            todos: [
              { content: "finished step", status: "completed", priority: "high" },
              { content: "current step", status: "in_progress", priority: "high" },
            ],
          },
        },
      ],
    });
    await harness.session.prompt("implement the two steps in this project");

    await harness.session.prompt("/todos");
    const shown = harness.notifications.at(-1) ?? "";
    expect(shown).toContain("current step");
    // The overlay hides terminal items; the command must not.
    expect(shown).toContain("finished step");
    expect(shown).toContain("1 open");
  });

  it("clears the list and the overlay via /todos reset", async () => {
    harness = await startHarness();
    harness.script.push({
      toolCalls: [{ name: "todo_write", args: openList([["temporary task", "in_progress"]]) }],
    });
    await harness.session.prompt("implement the temporary task in this project");
    expect(harness.isOverlayVisible()).toBe(true);

    await harness.session.prompt("/todos reset");

    expect(harness.isOverlayVisible()).toBe(false);
    expect(harness.notifications.at(-1)).toContain("cleared");

    // The reset is durable: a fresh runtime over the same branch sees an empty list.
    harness.script.push({ toolCalls: [{ name: "todo_read", args: {} }] });
    harness.script.push({ text: "empty" });
    await harness.session.prompt("check the plan");
    const readResult = harness.session.messages
      .filter((message) => (message as { toolName?: string }).toolName === "todo_read")
      .at(-1) as { content?: Array<{ text?: string }> };
    expect(readResult.content?.[0]?.text).toContain("No todos");
  });

  it("keeps a declined /todos reset harmless", async () => {
    harness = await startHarness();
    harness.script.push({
      toolCalls: [{ name: "todo_write", args: openList([["keep me", "in_progress"]]) }],
    });
    await harness.session.prompt("implement the task to keep in this project");

    harness.setConfirmAnswer(false);
    await harness.session.prompt("/todos reset");

    expect(harness.isOverlayVisible()).toBe(true);
    expect(harness.widgetLines().join("\n")).toContain("keep me");
  });

  it("reports persistence health via /todo-diagnose", async () => {
    harness = await startHarness();
    harness.script.push({
      toolCalls: [{ name: "todo_write", args: openList([["diagnosed task", "in_progress"]]) }],
    });
    await harness.session.prompt("implement the diagnosed task in this project");

    await harness.session.prompt("/todo-diagnose");
    const report = harness.notifications.at(-1) ?? "";
    expect(report).toContain("consistent");
    expect(report).toContain("diagnosed task");
  });

  it("stops nudging after /todos reminders off", async () => {
    harness = await startHarness();
    await harness.session.prompt("/todos reminders off");

    harness.script.push({ text: "ack" });
    await harness.session.prompt("audit this whole repository and report what needs optimising");

    const last = harness.requests.at(-1)!.messages.at(-1) as { content?: Array<{ text?: string }> };
    expect(last.content?.[0]?.text ?? "").not.toContain("<system-reminder>");
  });
});

describe("real pi runtime: non-TUI hosts", () => {
  it("sends the overlay as plain lines in rpc mode, which drops factories", async () => {
    harness = await startHarness({ mode: "rpc" });
    harness.script.push({
      toolCalls: [
        {
          name: "todo_write",
          args: openList([
            ["rpc task", "in_progress"],
            ["next", "pending"],
          ]),
        },
      ],
    });
    await harness.session.prompt("implement the rpc task in this project");

    expect(harness.currentWidget()?.kind).toBe("lines");
    const lines = harness.widgetLines();
    expect(lines[0]).toBe("Updated Plan");
    expect(lines.join("\n")).toContain("[•] rpc task");
    // biome-ignore lint/suspicious/noControlCharactersInRegex: asserting the absence of escape codes
    for (const line of lines) expect(line).not.toMatch(/\x1b/);
  });
});
