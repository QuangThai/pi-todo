import type { TodoItem } from "./types.js";

let currentTodos: TodoItem[] = [];
/** Serializes todo_write/todo_read across parallel tool batches. */
let storeChain: Promise<unknown> = Promise.resolve();

export function getTodos(): TodoItem[] {
  return currentTodos.map((t) => ({ ...t }));
}

export function setTodos(todos: readonly TodoItem[]): void {
  currentTodos = todos.map((t) => ({ ...t }));
}

export function clearTodos(): void {
  currentTodos = [];
}

/**
 * Run store-touching work in a single-file queue so parallel tool batches
 * (todo_write + todo_read in the same turn) cannot race.
 */
export function withStoreLock<T>(fn: () => T | Promise<T>): Promise<T> {
  const run = storeChain.then(() => fn());
  storeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Test helper — reset module state between tests. */
export function __resetStore(): void {
  currentTodos = [];
  storeChain = Promise.resolve();
}
