import type { TodoItem, TodoWriteDetails } from "./types.js";
import { TODO_PRIORITIES, TODO_STATE_ENTRY_TYPE, TODO_STATUSES, TOOL_UPDATE, TOOL_WRITE } from "./types.js";

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
 * Pi's `getBranch()` walks leaf->root then reverses, so entries arrive in
 * root->leaf (chronological) order. Last valid entry wins — custom
 * `pi-todo.state` entries plus both mutation toolResult details are tracked.
 * Tool-result replay is a fallback when a compaction retains messages but drops
 * old custom entries.
 *
 * Error envelopes (e.g. validation failures) are skipped so they never
 * overwrite a good state.
 */
export function replayFromBranch(ctx: { sessionManager: { getBranch(): Iterable<unknown> } }): TodoItem[] {
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
    if (msg.role !== "toolResult" || (msg.toolName !== TOOL_WRITE && msg.toolName !== TOOL_UPDATE)) {
      continue;
    }
    if (!isWriteDetails(msg.details)) continue;
    // Skip error envelopes — they did not commit
    if (msg.details.error) continue;
    todos = msg.details.todos.map((t) => ({ ...t }));
  }

  return todos;
}
