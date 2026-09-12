import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { TodoItem, TodoWriteDetails } from "../types.js";
import { TODO_STATE_ENTRY_TYPE } from "../types.js";

const STALE_SESSION = /stale after session replacement/i;
/** Kept verbatim: replay treats any truthy `details.error` as "did not commit". */
export const STALE_SESSION_ERROR = "stale session replacement";

export interface PersistFailure {
  /** Machine-readable marker stored in details so replay skips the envelope. */
  error: string;
  /** Text for the model, naming the tool to retry. */
  message: string;
}

/**
 * Append the durable checkpoint *before* the in-memory store is updated, so a
 * failed append can never leave the store ahead of the session.
 *
 * Returns a failure when the write must be abandoned (the session was replaced
 * underneath us); rethrows anything else, because a real disk or runtime error
 * should surface as a tool error rather than be swallowed as "not committed".
 */
export function persistTodoState(
  pi: ExtensionAPI,
  todos: readonly TodoItem[],
  toolName: string,
): PersistFailure | undefined {
  try {
    pi.appendEntry(TODO_STATE_ENTRY_TYPE, { todos });
    return undefined;
  } catch (e) {
    if (STALE_SESSION.test(String(e))) {
      return {
        error: STALE_SESSION_ERROR,
        message: `session was replaced — state not committed. Please retry ${toolName}.`,
      };
    }
    throw e;
  }
}

/** Error envelope that keeps the last good list in details for the UI. */
export function errorResult(
  current: readonly TodoItem[],
  error: string,
  message = error,
): { content: [{ type: "text"; text: string }]; details: TodoWriteDetails } {
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    details: { todos: current.map((t) => ({ ...t })), error },
  };
}
