/**
 * pi-todo — OpenCode-like session todo checklist for Pi.
 *
 * Tools: todo_write (full replace), todo_read
 * Overlay: # Todos with [ ]/[•]/[✓]/[×] above the editor
 * Persistence: toolResult details + custom entry, replayed from branch
 * Reminder: pi-tasks-style cadence → transient <system-reminder> via context
 * Cold start: pi-todotools section + prompt-aware one-shot context nudge
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { formatPlainTodoLine } from "./format.js";
import { TodoOverlay } from "./overlay.js";
import {
  buildColdStartReminder,
  buildCompletionUpdateReminder,
  shouldNudgeColdStart,
  shouldNudgeCompletionUpdate,
} from "./prompt-intent.js";
import { COLD_START_BOOST, TASK_MANAGEMENT_SECTION } from "./prompt.js";
import {
  buildSystemReminder,
  createCadenceState,
  drainReminderForContext,
  evaluateToolResult,
  onTurnStart,
  REMINDER_INTERVAL,
  resetCadenceState,
  type CadenceConfig,
} from "./reminder-cadence.js";
import { replayFromBranch } from "./replay.js";
import { clearTodos, getTodos, setTodos } from "./store.js";
import { registerTodoReadTool } from "./tools/todoread.js";
import { registerTodoWriteTool } from "./tools/todowrite.js";
import { TOOL_READ, TOOL_WRITE } from "./types.js";
import { hasOpenTodos, isOpenTodo } from "./validate.js";

const TODO_TOOL_NAMES = new Set([TOOL_WRITE, TOOL_READ]);

const cadenceConfig: CadenceConfig = {
  reminderInterval: REMINDER_INTERVAL,
  todoToolNames: TODO_TOOL_NAMES,
};

function isStaleCtxError(e: unknown): boolean {
  return /stale after session replacement/i.test(String(e));
}

function syncFromSession(ctx: ExtensionContext, overlay: TodoOverlay | undefined): void {
  try {
    setTodos(replayFromBranch(ctx));
  } catch (e) {
    if (!isStaleCtxError(e)) throw e;
    return;
  }
  if (ctx.hasUI && overlay) {
    overlay.setUICtx(ctx.ui);
    overlay.update();
  }
}

function injectReminderMessage(
  messages: unknown[],
  text: string,
): { messages: unknown[] } {
  return {
    messages: [
      ...messages,
      {
        role: "user" as const,
        content: [{ type: "text" as const, text }],
        timestamp: Date.now(),
      },
    ],
  };
}

export default function (pi: ExtensionAPI): void {
  let overlay: TodoOverlay | undefined;
  const cadence = createCadenceState();
  /** One-shot transient nudge for the next LLM context (cold start or completion). */
  let pendingIntentNudge: string | null = null;

  const refreshOverlay = (): void => {
    overlay?.update();
  };

  registerTodoWriteTool(pi, { onCommit: refreshOverlay });
  registerTodoReadTool(pi);

  // Cold-start + completion nudges. Tool description alone is often ignored;
  // prompt-aware section + one-shot context reminder (pi-tasks style) is stronger.
  pi.on("before_agent_start", async (event) => {
    const prompt = typeof event.prompt === "string" ? event.prompt : "";
    const open = hasOpenTodos(getTodos());
    let systemPrompt = `${event.systemPrompt}\n${TASK_MANAGEMENT_SECTION}`;

    if (shouldNudgeColdStart(prompt, open)) {
      systemPrompt += `\n${COLD_START_BOOST}`;
      pendingIntentNudge = buildColdStartReminder(prompt);
    } else if (shouldNudgeCompletionUpdate(prompt, open)) {
      const openLines = getTodos().filter(isOpenTodo).map(formatPlainTodoLine);
      pendingIntentNudge = buildCompletionUpdateReminder(openLines);
    }

    return { systemPrompt };
  });

  pi.on("session_start", async (_event, ctx) => {
    resetCadenceState(cadence);
    pendingIntentNudge = null;
    if (ctx.hasUI && !overlay) {
      overlay = new TodoOverlay();
    }
    syncFromSession(ctx, overlay);
  });

  pi.on("session_tree", async (_event, ctx) => {
    syncFromSession(ctx, overlay);
  });

  pi.on("session_compact", async (_event, ctx) => {
    syncFromSession(ctx, overlay);
  });

  pi.on("session_shutdown", async () => {
    try {
      overlay?.dispose();
    } finally {
      // Clear in-memory store so a stale session_start (early return) cannot
      // briefly expose the previous session's todos to reminders/tools.
      clearTodos();
      overlay = undefined;
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
    const isTodoTool = TODO_TOOL_NAMES.has(event.toolName);
    if (
      !isTodoTool &&
      cadence.currentTurn - cadence.lastTodoToolUseTurn < REMINDER_INTERVAL
    ) {
      return;
    }
    if (!isTodoTool && cadence.reminderInjectedThisCycle) return;

    const hasOpenWork = isTodoTool ? false : hasOpenTodos(getTodos());
    evaluateToolResult(cadence, event.toolName, hasOpenWork, cadenceConfig);
  });

  // Transient injection for one LLM call — not persisted in the session store.
  // Intent nudge (cold start / user-said-done) takes priority over idle cadence.
  // Peer typings sometimes omit "context" from the overloaded `on` signature.
  const onEvent = pi.on.bind(pi) as (event: string, handler: (...args: never[]) => unknown) => void;
  onEvent("context", async (event: { messages: unknown[] }) => {
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

  // Refresh from in-memory store — do NOT replayFromBranch here (branch is stale).
  // Clear intent nudge once todo_write succeeds (model complied; avoid double-inject).
  pi.on("tool_execution_end", async (event) => {
    if (event.toolName !== TOOL_WRITE || event.isError) return;
    pendingIntentNudge = null;
    overlay?.update();
  });
}
