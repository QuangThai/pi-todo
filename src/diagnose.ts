import { formatPlainTodoLine } from "./format.js";
import type { TodoItem } from "./types.js";
import { getTodoIntegrityIssues, todosEqual } from "./validate.js";

export type DiagnosisStatus = "consistent" | "mismatch" | "repair_needed";

export interface TodoDiagnosis {
  status: DiagnosisStatus;
  storeTodos: TodoItem[];
  replayedTodos: TodoItem[];
  integrityIssues: string[];
}

/**
 * Compare the live in-memory snapshot against the durable session replay.
 *
 * This is a user-facing diagnostic, exposed as `/todo-diagnose` rather than as a
 * tool: the model never needs it, and a tool would spend its description and
 * schema tokens on every request for something only a human investigates.
 */
export function diagnoseTodos(
  storeTodos: readonly TodoItem[],
  replayedTodos: readonly TodoItem[],
): TodoDiagnosis {
  const integrityIssues = [
    ...getTodoIntegrityIssues(storeTodos).map((issue) => `current: ${issue}`),
    ...getTodoIntegrityIssues(replayedTodos).map((issue) => `durable: ${issue}`),
  ];
  const status: DiagnosisStatus =
    integrityIssues.length > 0
      ? "repair_needed"
      : todosEqual(storeTodos, replayedTodos)
        ? "consistent"
        : "mismatch";
  return {
    status,
    storeTodos: storeTodos.map((t) => ({ ...t })),
    replayedTodos: replayedTodos.map((t) => ({ ...t })),
    integrityIssues,
  };
}

export function summarizeDiagnosis(diagnosis: TodoDiagnosis): string {
  switch (diagnosis.status) {
    case "consistent":
      return "Persistence check: consistent — the live snapshot matches the durable branch replay.";
    case "repair_needed":
      return "Integrity check: REPAIR NEEDED — duplicate or missing IDs found. Ask the agent to rewrite the list with todo_write, omitting id for each affected item.";
    default:
      return "Persistence check: MISMATCH — the live snapshot differs from the durable branch replay.";
  }
}

/** Human-readable report lines. Nothing here is sent to the model. */
export function formatDiagnosis(diagnosis: TodoDiagnosis): string[] {
  const lines = [summarizeDiagnosis(diagnosis), ""];
  lines.push(`live (${diagnosis.storeTodos.length}):`);
  lines.push(...renderList(diagnosis.storeTodos));
  lines.push("");
  lines.push(`durable (${diagnosis.replayedTodos.length}):`);
  lines.push(...renderList(diagnosis.replayedTodos));
  if (diagnosis.integrityIssues.length > 0) {
    lines.push("");
    lines.push("issues:");
    lines.push(...diagnosis.integrityIssues.map((issue) => `  - ${issue}`));
  }
  return lines;
}

function renderList(todos: readonly TodoItem[]): string[] {
  if (todos.length === 0) return ["  (empty)"];
  return todos.map((todo) => `  ${formatPlainTodoLine(todo, { showPriority: true })}`);
}
