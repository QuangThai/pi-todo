import type { TodoItem, TodoWriteDetails } from "./types.js";
import { TODO_STATE_ENTRY_TYPE, TOOL_WRITE } from "./types.js";
import { TERMINAL_STATUSES, TODO_PRIORITIES, TODO_STATUSES } from "./types.js";

type BranchEntry = {
  type?: string;
  customType?: string;
  data?: unknown;
  message?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function isTodoItem(value: unknown): value is TodoItem {
  if (!isRecord(value)) return false;
  return (
    typeof value.content === "string" &&
    typeof value.status === "string" &&
    (TODO_STATUSES as readonly string[]).includes(value.status) &&
    typeof value.priority === "string" &&
    (TODO_PRIORITIES as readonly string[]).includes(value.priority)
  );
}

function isTodoList(value: unknown): value is TodoItem[] {
  return Array.isArray(value) && value.every(isTodoItem);
}

function isWriteDetails(value: unknown): value is TodoWriteDetails {
  return isRecord(value) && isTodoList(value.todos);
}

/**
 * Replay todo state from the session branch.
 *
 * Pi guarantees getBranch() returns entries in root→leaf (chronological) order.
 * Last valid entry wins — custom `pi-todo.state` entries and `todo_write`
 * toolResult details are both tracked.
 *
 * Error envelopes (e.g. validation failures) are skipped so they never
 * overwrite a good state.
 */
export function replayFromBranch(ctx: {
  sessionManager: { getBranch(): Iterable<unknown> };
}): TodoItem[] {
  let todos: TodoItem[] = [];

  for (const entry of ctx.sessionManager.getBranch()) {
    const e = entry as BranchEntry;

    if (e.type === "custom" && e.customType === TODO_STATE_ENTRY_TYPE) {
      if (isRecord(e.data) && isTodoList(e.data.todos)) {
        todos = e.data.todos.map((t) => ({ ...t }));
      }
      continue;
    }

    if (e.type !== "message" || !isRecord(e.message)) continue;
    const msg = e.message as Record<string, unknown>;
    if (msg.role !== "toolResult" || msg.toolName !== TOOL_WRITE) continue;
    if (!isWriteDetails(msg.details)) continue;
    // Skip error envelopes — they did not commit
    if ((msg.details as TodoWriteDetails).error) continue;
    todos = (msg.details as TodoWriteDetails).todos.map((t) => ({ ...t }));
  }

  return todos;
}

export function isTerminalList(todos: readonly TodoItem[]): boolean {
  return todos.length === 0 || todos.every((t) => TERMINAL_STATUSES.has(t.status));
}
