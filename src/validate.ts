import { sanitizeTodoText } from "./sanitize.js";
import type { TodoItem, TodoPriority, TodoStatus } from "./types.js";
import { MAX_CONTENT_LENGTH, TODO_PRIORITIES, TODO_STATUSES } from "./types.js";

export type ValidateOk = { ok: true; todos: TodoItem[]; unchanged: boolean };
export type ValidateErr = { ok: false; error: string };
export type ValidateResult = ValidateOk | ValidateErr;

function isStatus(value: unknown): value is TodoStatus {
  return typeof value === "string" && (TODO_STATUSES as readonly string[]).includes(value);
}

function isPriority(value: unknown): value is TodoPriority {
  return typeof value === "string" && (TODO_PRIORITIES as readonly string[]).includes(value);
}

export function todosEqual(a: readonly TodoItem[], b: readonly TodoItem[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (item, i) =>
      item.content === b[i].content && item.status === b[i].status && item.priority === b[i].priority,
  );
}

/**
 * Validate and normalize a full-replace payload.
 * Hard-enforces at most one `in_progress`. Does not mutate `current`.
 */
export function validateTodoWrite(
  rawTodos: unknown,
  current: readonly TodoItem[],
): ValidateResult {
  if (!Array.isArray(rawTodos)) {
    return { ok: false, error: "todos must be an array" };
  }

  const todos: TodoItem[] = [];
  let inProgressCount = 0;

  for (let i = 0; i < rawTodos.length; i++) {
    const item = rawTodos[i];
    if (!item || typeof item !== "object") {
      return { ok: false, error: `todos[${i}] must be an object` };
    }
    const rec = item as Record<string, unknown>;

    if (typeof rec.content !== "string") {
      return { ok: false, error: `todos[${i}].content must be a string` };
    }
    let content = sanitizeTodoText(rec.content);
    if (!content) {
      return { ok: false, error: `todos[${i}].content must be non-empty` };
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      content = `${content.slice(0, MAX_CONTENT_LENGTH - 1)}…`;
    }

    if (!isStatus(rec.status)) {
      return {
        ok: false,
        error: `todos[${i}].status must be one of: ${TODO_STATUSES.join(", ")}`,
      };
    }
    if (!isPriority(rec.priority)) {
      return {
        ok: false,
        error: `todos[${i}].priority must be one of: ${TODO_PRIORITIES.join(", ")}`,
      };
    }

    if (rec.status === "in_progress") inProgressCount += 1;

    todos.push({ content, status: rec.status, priority: rec.priority });
  }

  if (inProgressCount > 1) {
    return {
      ok: false,
      error: `exactly one in_progress allowed (got ${inProgressCount}); keep only the active task in_progress`,
    };
  }

  return { ok: true, todos, unchanged: todosEqual(todos, current) };
}

export function isTerminalStatus(status: TodoStatus): boolean {
  return status === "completed" || status === "cancelled";
}

export function isOpenTodo(todo: TodoItem): boolean {
  return !isTerminalStatus(todo.status);
}

export function hasOpenTodos(todos: readonly TodoItem[]): boolean {
  return todos.some(isOpenTodo);
}

export function countOpenTodos(todos: readonly TodoItem[]): number {
  return todos.filter(isOpenTodo).length;
}

/** Count of `in_progress` items (shown as "running" in the overlay heading). */
export function countRunningTodos(todos: readonly TodoItem[]): number {
  return todos.filter((t) => t.status === "in_progress").length;
}
