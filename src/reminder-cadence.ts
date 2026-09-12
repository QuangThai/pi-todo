/**
 * Pure cadence logic for system-reminder injection (ported from tintinweb/pi-tasks).
 *
 * tool_result tracks cadence only — it never mutates tool output.
 * context drains the pending reminder into a transient message for one LLM call.
 *
 * The reminder body is state-aware (edxeth/meh pi-tasks pattern): it lists open
 * todos only, and calls out the in_progress item so the model updates status.
 *
 * Cadence contract: at most one reminder per `reminderInterval` turns while open
 * work remains. Draining re-bases the window, so a reminder the model ignores is
 * re-armed one interval later instead of silencing the extension for the rest of
 * the session.
 */

import { formatPlainTodoLine } from "./format.js";
import type { TodoItem } from "./types.js";
import { hasOpenTodos, isOpenTodo } from "./validate.js";

export interface CadenceState {
  currentTurn: number;
  lastTodoToolUseTurn: number;
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
    reminderDue: false,
  };
}

export function resetCadenceState(state: CadenceState): void {
  state.currentTurn = 0;
  state.lastTodoToolUseTurn = 0;
  state.reminderDue = false;
}

export function onTurnStart(state: CadenceState): void {
  state.currentTurn++;
}

/** True when enough turns have passed since the last todo-tool call or reminder. */
export function isReminderWindowOpen(state: CadenceState, config: CadenceConfig): boolean {
  return state.currentTurn - state.lastTodoToolUseTurn >= config.reminderInterval;
}

/**
 * Decide the cadence change from a tool_result. Mutates state; returns whether
 * the reminder is now queued for the next context event.
 *
 * `hasOpenWork` must reflect pending/in_progress only — an all-terminal list
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
    state.reminderDue = false;
    return { markDue: false };
  }

  if (!isReminderWindowOpen(state, config)) return { markDue: false };
  if (!hasOpenWork) return { markDue: false };

  state.reminderDue = true;
  return { markDue: true };
}

/**
 * Drain the pending reminder when `context` fires.
 *
 * Re-bases the window on the current turn, which both prevents a second
 * injection for the same window and schedules the next one an interval later.
 */
export function drainReminderForContext(state: CadenceState): boolean {
  if (!state.reminderDue) return false;
  state.reminderDue = false;
  state.lastTodoToolUseTurn = state.currentTurn;
  return true;
}

/** Default: 4 turns without a todo tool while open work remains. */
export const REMINDER_INTERVAL = 4;

/**
 * Build a transient system-reminder from the live open-todo snapshot.
 * Returns null when there is nothing open (caller must not inject).
 */
export function buildSystemReminder(todos: readonly TodoItem[]): string | null {
  if (!hasOpenTodos(todos)) return null;

  const open = todos.filter(isOpenTodo);
  const inProgress = open.filter((t) => t.status === "in_progress");
  const lines = open.map((todo) => formatPlainTodoLine(todo));

  const focus =
    inProgress.length > 0
      ? `Active item still in_progress: "${inProgress[0].content}". If that work is finished, use todo_update to patch its known ID, or todo_write for a full replacement, and mark it completed; then set the next pending item to in_progress in the same mutation. Do not leave a stale [•] after finishing a step.`
      : `Open items are still pending with none in_progress. If you are about to work, call todo_write and mark exactly one item in_progress before continuing.`;

  return `<system-reminder>
The todo tools haven't been used recently, and open work remains:

${lines.map((l) => `- ${l}`).join("\n")}

${focus}

Only act if relevant to the current work. This is a gentle reminder — ignore if not applicable. NEVER mention this reminder to the user.
</system-reminder>`;
}
