/**
 * pi-todo — OpenCode-like session todo checklist for Pi.
 *
 * Tools:    todo_write (full replace), todo_update (patch by ID), todo_read
 * Commands: /todos (view, reset, toggle reminders), /todo-diagnose (read-only)
 * Overlay:  "Updated Plan" tree with [ ]/[•]/[✓]/[×] above the editor
 * State:    toolResult details + custom entry, replayed from the session branch
 * Nudges:   idle cadence and cold-start reminders, injected as a transient tail
 *           message from the `context` event
 *
 * The system prompt is never modified per turn. pi renders tools -> system ->
 * messages and the provider caches that prefix, so a system prompt that changes
 * between user turns invalidates the whole cached history. Stable instructions
 * therefore live in the tool description and `promptGuidelines`; anything
 * situational is a tail message instead.
 */

import type {
  ContextEvent,
  ExtensionAPI,
  ExtensionContext,
  ExtensionUIContext,
} from "@earendil-works/pi-coding-agent";
import { registerTodoCommands } from "./commands/todos.js";
import { formatPlainTodoLine } from "./format.js";
import { TodoOverlay } from "./overlay.js";
import { buildColdStartReminder, buildCompletionUpdateReminder, classifyPrompt } from "./prompt-intent.js";
import {
  buildSystemReminder,
  type CadenceConfig,
  createCadenceState,
  drainReminderForContext,
  evaluateToolResult,
  isReminderWindowOpen,
  onTurnStart,
  REMINDER_INTERVAL,
  resetCadenceState,
} from "./reminder-cadence.js";
import { replayFromBranch } from "./replay.js";
import { clearTodos, getTodos, setTodos } from "./store.js";
import { registerTodoReadTool } from "./tools/todoread.js";
import { registerTodoUpdateTool } from "./tools/todoupdate.js";
import { registerTodoWriteTool } from "./tools/todowrite.js";
import { FLAG_NO_NUDGES, STATUS_KEY, TOOL_READ, TOOL_UPDATE, TOOL_WRITE } from "./types.js";
import { countOpenTodos, hasOpenTodos, isOpenTodo } from "./validate.js";

const TODO_TOOL_NAMES = new Set([TOOL_WRITE, TOOL_READ, TOOL_UPDATE]);

const cadenceConfig: CadenceConfig = {
  reminderInterval: REMINDER_INTERVAL,
  todoToolNames: TODO_TOOL_NAMES,
};

function isStaleCtxError(e: unknown): boolean {
  return /stale after session replacement/i.test(String(e));
}

/** Message list as pi hands it to the `context` event. */
type ContextMessages = ContextEvent["messages"];

function injectReminderMessage(messages: ContextMessages, text: string): { messages: ContextMessages } {
  const reminder: ContextMessages[number] = {
    role: "user",
    content: [{ type: "text", text }],
    timestamp: Date.now(),
  };
  return { messages: [...messages, reminder] };
}

export default function (pi: ExtensionAPI): void {
  let overlay: TodoOverlay | undefined;
  let uiCtx: ExtensionUIContext | undefined;
  const cadence = createCadenceState();
  /** One-shot transient nudge for the next LLM context (cold start or completion). */
  let pendingIntentNudge: string | null = null;
  let nudgesEnabled = true;

  pi.registerFlag(FLAG_NO_NUDGES, {
    description: "Disable pi-todo cold-start and idle reminders for this run",
    type: "boolean",
    default: false,
  });

  const updateStatus = (): void => {
    if (!uiCtx) return;
    const todos = getTodos();
    const open = countOpenTodos(todos);
    uiCtx.setStatus(STATUS_KEY, open > 0 ? `todos ${todos.length - open}/${todos.length}` : undefined);
  };

  const refresh = (): void => {
    overlay?.update();
    updateStatus();
  };

  const syncFromSession = (ctx: ExtensionContext): void => {
    try {
      setTodos(replayFromBranch(ctx));
    } catch (e) {
      if (!isStaleCtxError(e)) throw e;
      return;
    }
    if (ctx.hasUI) {
      uiCtx = ctx.ui;
      // Only interactive mode can run a component factory; every other host
      // needs the plain string form or it sees no overlay at all.
      overlay?.setUICtx(ctx.ui, ctx.mode === "tui");
    }
    refresh();
  };

  registerTodoWriteTool(pi, { onCommit: refresh });
  registerTodoUpdateTool(pi, { onCommit: refresh });
  registerTodoReadTool(pi);
  registerTodoCommands(pi, {
    onCommit: refresh,
    areNudgesEnabled: () => nudgesEnabled,
    setNudgesEnabled: (enabled) => {
      nudgesEnabled = enabled;
      if (!enabled) pendingIntentNudge = null;
    },
  });

  // Queue a one-shot nudge. The system prompt is intentionally left untouched.
  pi.on("before_agent_start", async (event) => {
    if (!nudgesEnabled) return;
    const prompt = typeof event.prompt === "string" ? event.prompt : "";
    const todos = getTodos();
    const open = hasOpenTodos(todos);
    const kind = classifyPrompt(prompt).kind;

    if (!open && kind === "multi_step") {
      pendingIntentNudge = buildColdStartReminder(prompt);
    } else if (open && kind === "completion") {
      const openLines = todos.filter(isOpenTodo).map((todo) => formatPlainTodoLine(todo));
      pendingIntentNudge = buildCompletionUpdateReminder(openLines);
    }
  });

  pi.on("session_start", async (_event, ctx) => {
    resetCadenceState(cadence);
    pendingIntentNudge = null;
    nudgesEnabled = pi.getFlag(FLAG_NO_NUDGES) !== true;
    if (ctx.hasUI && !overlay) {
      overlay = new TodoOverlay();
    }
    syncFromSession(ctx);
  });

  pi.on("session_tree", async (_event, ctx) => {
    syncFromSession(ctx);
  });

  pi.on("session_compact", async (_event, ctx) => {
    syncFromSession(ctx);
  });

  pi.on("session_shutdown", async () => {
    try {
      uiCtx?.setStatus(STATUS_KEY, undefined);
      overlay?.dispose();
    } finally {
      // Clear in-memory store so a stale session_start (early return) cannot
      // briefly expose the previous session's todos to reminders/tools.
      clearTodos();
      overlay = undefined;
      uiCtx = undefined;
      pendingIntentNudge = null;
      resetCadenceState(cadence);
    }
  });

  pi.on("turn_start", async () => {
    onTurnStart(cadence);
  });

  // Cadence tracking only — never mutate tool result content.
  // Gate on open work (pending/in_progress), not all-terminal lists.
  pi.on("tool_result", async (event) => {
    if (!nudgesEnabled) return;
    const isTodoTool = TODO_TOOL_NAMES.has(event.toolName);
    // Cheap guard: only inspect the list once the window could actually be open.
    if (!isTodoTool && !isReminderWindowOpen(cadence, cadenceConfig)) return;
    const hasOpenWork = isTodoTool ? false : hasOpenTodos(getTodos());
    evaluateToolResult(cadence, event.toolName, hasOpenWork, cadenceConfig);
  });

  // Transient injection for one LLM call — not persisted in the session store.
  // Intent nudge (cold start / user-said-done) takes priority over idle cadence.
  pi.on("context", async (event) => {
    if (!nudgesEnabled) return;
    if (pendingIntentNudge) {
      const text = pendingIntentNudge;
      pendingIntentNudge = null;
      return injectReminderMessage(event.messages, text);
    }

    if (!drainReminderForContext(cadence)) return;

    const reminder = buildSystemReminder(getTodos());
    if (!reminder) return;

    return injectReminderMessage(event.messages, reminder);
  });

  // Refresh from the in-memory store — do NOT replayFromBranch here (the branch
  // is not yet updated with this tool result).
  //
  // A returned error envelope does not set `isError` (only a thrown error does),
  // so a failed validation must be detected from details.error — otherwise a
  // rejected write would clear the nudge as though the model had complied.
  pi.on("tool_execution_end", async (event) => {
    if (event.toolName !== TOOL_WRITE && event.toolName !== TOOL_UPDATE) return;
    const details = event.result?.details as { error?: string } | undefined;
    if (event.isError || details?.error) return;
    pendingIntentNudge = null;
    refresh();
  });
}
