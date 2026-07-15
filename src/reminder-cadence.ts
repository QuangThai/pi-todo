/**
 * Pure cadence logic for system-reminder injection (ported from tintinweb/pi-tasks).
 *
 * tool_result tracks cadence only — never mutates tool output.
 * context drains the pending reminder into a transient user message for one LLM call.
 *
 * Reminder body is state-aware (edxeth/meh pi-tasks pattern): list open todos only,
 * and call out the in_progress item so the model updates completed status.
 */

import { formatPlainTodoLine } from "./format.js";
import type { TodoItem } from "./types.js";
import { hasOpenTodos, isOpenTodo } from "./validate.js";

export interface CadenceState {
  currentTurn: number;
  lastTodoToolUseTurn: number;
  reminderInjectedThisCycle: boolean;
  reminderDue: boolean;
}

export interface CadenceConfig {
  /** Turns without a todo-tool call before a reminder is considered due. */
  reminderInterval: number;
  /** Tool names that count as todo usage and reset cadence. */
  todoToolNames: ReadonlySet<string>;
}

export function createCadenceState(): CadenceState {
  return {
    currentTurn: 0,
    lastTodoToolUseTurn: 0,
    reminderInjectedThisCycle: false,
    reminderDue: false,
  };
}

export function resetCadenceState(state: CadenceState): void {
  state.currentTurn = 0;
  state.lastTodoToolUseTurn = 0;
  state.reminderInjectedThisCycle = false;
  state.reminderDue = false;
}

export function onTurnStart(state: CadenceState): void {
  state.currentTurn++;
}

/**
 * Decide cadence change from a tool_result. Mutates state; returns whether
 * the reminder should be queued for the next context event.
 *
 * `hasOpenWork` must reflect pending/in_progress only — all-terminal lists
 * should not re-arm reminders (OpenCode: done means overlay gone).
 */
export function evaluateToolResult(
  state: CadenceState,
  toolName: string,
  hasOpenWork: boolean,
  config: CadenceConfig,
): { markDue: boolean } {
  if (config.todoToolNames.has(toolName)) {
    state.lastTodoToolUseTurn = state.currentTurn;
    state.reminderInjectedThisCycle = false;
    state.reminderDue = false;
    return { markDue: false };
  }

  if (state.currentTurn - state.lastTodoToolUseTurn < config.reminderInterval) {
    return { markDue: false };
  }
  if (state.reminderInjectedThisCycle) return { markDue: false };
  if (!hasOpenWork) return { markDue: false };

  state.reminderDue = true;
  return { markDue: true };
}

/** Drain pending reminder when `context` fires. */
export function drainReminderForContext(state: CadenceState): boolean {
  if (!state.reminderDue) return false;
  state.reminderDue = false;
  state.reminderInjectedThisCycle = true;
  state.lastTodoToolUseTurn = state.currentTurn;
  return true;
}

/** Default: 4 turns without todo_write/todo_read while open work remains. */
export const REMINDER_INTERVAL = 4;

/**
 * Build a transient system-reminder from the live open-todo snapshot.
 * Returns null when there is nothing open (caller must not inject).
 */
export function buildSystemReminder(todos: readonly TodoItem[]): string | null {
  if (!hasOpenTodos(todos)) return null;

  const open = todos.filter(isOpenTodo);
  const inProgress = open.filter((t) => t.status === "in_progress");
  const lines = open.map(formatPlainTodoLine);

  const focus =
    inProgress.length > 0
      ? `Active item still in_progress: "${inProgress[0].content}". If that work is finished, call todo_write immediately with it marked completed (full replace), then set the next pending item to in_progress (exactly one). Do not leave a stale [•] after finishing a step.`
      : `Open items are still pending with none in_progress. If you are about to work, call todo_write and mark exactly one item in_progress before continuing.`;

  return `<system-reminder>
The todo tools haven't been used recently, and open work remains:

${lines.map((l) => `- ${l}`).join("\n")}

${focus}

Only act if relevant to the current work. This is a gentle reminder — ignore if not applicable. NEVER mention this reminder to the user.
</system-reminder>`;
}
