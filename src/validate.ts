import { sanitizeTodoText } from "./sanitize.js";
import type { TodoItem, TodoPriority, TodoStatus } from "./types.js";
import { MAX_CONTENT_LENGTH, MAX_TODO_ITEMS, TODO_PRIORITIES, TODO_STATUSES } from "./types.js";

/** Short sequential IDs (`t1`, `t2`, …) — easy for LLMs to copy; avoids UUID typos. */
export function nextShortTodoId(used: ReadonlySet<string>): string {
  let n = 1;
  while (used.has(`t${n}`)) n += 1;
  return `t${n}`;
}

function formatAvailableIds(current: readonly TodoItem[]): string {
  const ids = current.map((t) => t.id).filter((id): id is string => typeof id === "string" && id.length > 0);
  if (ids.length === 0) return "(none)";
  return ids.join(", ");
}

export type ValidateOk = {
  ok: true;
  todos: TodoItem[];
  unchanged: boolean;
  recoveredIds?: string[];
};
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
        item.id === b[i].id && item.content === b[i].content && item.status === b[i].status && item.priority === b[i].priority,
  );
}

/**
 * Validate and normalize a full-replace payload.
 * Hard-enforces at most one `in_progress`; stale IDs are normalized as new items.
 * Does not mutate `current`.
 */
export function validateTodoWrite(
  rawTodos: unknown,
  current: readonly TodoItem[],
): ValidateResult {
  if (!Array.isArray(rawTodos)) {
    return { ok: false, error: "todos must be an array" };
  }
  if (rawTodos.length > MAX_TODO_ITEMS) {
    return { ok: false, error: `todos must contain at most ${MAX_TODO_ITEMS} items` };
  }

  const todos: TodoItem[] = [];
  let inProgressCount = 0;
  const seenIds = new Set<string>();
  const currentIds = new Set(current.map((t) => t.id).filter(Boolean));
  const recoveredIds: string[] = [];

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

    let id: string | undefined;
    if (rec.id !== undefined) {
      if (typeof rec.id !== "string" || !rec.id.trim()) {
        return { ok: false, error: `todos[${i}].id must be a non-empty string when provided` };
      }
      if (currentIds.has(rec.id)) {
        if (seenIds.has(rec.id)) {
          return { ok: false, error: `todos[${i}].id "${rec.id}" is duplicated` };
        }
        seenIds.add(rec.id);
        id = rec.id;
      } else {
        // IDs are session-local. An ID copied from an older session/branch is
        // a new-item hint, not a reason to reject the whole replacement.
        recoveredIds.push(rec.id);
      }
    }
    todos.push({ ...(id ? { id } : {}), content, status: rec.status, priority: rec.priority });
  }

  if (inProgressCount > 1) {
    return {
      ok: false,
      error: `exactly one in_progress allowed (got ${inProgressCount}); keep only the active task in_progress`,
    };
  }

  return {
    ok: true,
    todos,
    unchanged: todosEqual(todos, current),
    ...(recoveredIds.length > 0 ? { recoveredIds } : {}),
  };
}

/** Assign IDs once at mutation time.
 *
 * - Items with an explicit ID that exists in `current` keep it; stale/unknown IDs
 *   are removed by `validateTodoWrite` and are assigned below as new items.
 * - Explicit IDs are reserved before matching so an id-less item cannot claim
 *   an ID that another incoming item explicitly preserves.
 * - Items without `id` try to match a prior item: first by full tuple
 *   (content+status+priority), then by unique content.  If ambiguous (multiple
 *   same-content items) or no prior match, a new short ID (`tN`) is generated.
 */
export function ensureTodoIds(todos: readonly TodoItem[], current: readonly TodoItem[]): TodoItem[] {
  // Reserve every explicit ID up front. Incoming order must not decide whether an
  // id-less item steals an ID that a later item explicitly retains.
  const reserved = new Set(todos.flatMap((todo) => todo.id ? [todo.id] : []));
  const claimed = new Set<string>();
  // Avoid reusing any current ID in this pass — a later id-less item may still
  // match it by tuple/content. Freed IDs become reusable on the next write.
  const currentIds = new Set(current.flatMap((todo) => todo.id ? [todo.id] : []));

  // Pre-index content uniqueness: content that appears only once in `current`
  // is safe for content-only fallback.
  const contentCounts = new Map<string, number>();
  for (const c of current) {
    contentCounts.set(c.content, (contentCounts.get(c.content) ?? 0) + 1);
  }

  return todos.map((todo) => {
    let id = todo.id;
    if (!id) {
      // 1. Exact tuple match (content + status + priority)
      const byTuple = current.find(
          (c) => !!c.id && !reserved.has(c.id) && !claimed.has(c.id) &&
          c.content === todo.content &&
          c.status === todo.status &&
          c.priority === todo.priority,
      );
      if (byTuple) {
        id = byTuple.id;
      } else {
        // 2. Content-only fallback — only when content is unique in current
        const count = contentCounts.get(todo.content) ?? 0;
        if (count === 1) {
          const byContent = current.find(
              (c) => !!c.id && !reserved.has(c.id) && !claimed.has(c.id) && c.content === todo.content,
          );
          if (byContent) id = byContent.id;
        }
      }
      // 3. No match or ambiguous → fresh short sequential ID
      if (!id) {
        const used = new Set([...reserved, ...claimed, ...currentIds]);
        id = nextShortTodoId(used);
      }
    }
    claimed.add(id);
    return { ...todo, id };
  });
}

/** Report persisted-state identity problems without mutating legacy snapshots. */
export function getTodoIntegrityIssues(todos: readonly TodoItem[]): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < todos.length; i++) {
    const id = todos[i].id;
    if (typeof id !== "string" || !id.trim()) {
      issues.push(`todos[${i}] has no stable ID`);
      continue;
    }
    if (seen.has(id)) issues.push(`todos[${i}].id "${id}" is duplicated`);
    seen.add(id);
  }
  return issues;
}

export function validateTodoUpdate(rawUpdates: unknown, current: readonly TodoItem[]): ValidateResult {
  if (!Array.isArray(rawUpdates) || rawUpdates.length === 0) {
    return { ok: false, error: "updates must be a non-empty array" };
  }
  if (rawUpdates.length > MAX_TODO_ITEMS) {
    return { ok: false, error: `updates must contain at most ${MAX_TODO_ITEMS} items` };
  }
  const next = current.map((todo) => ({ ...todo }));
  const seen = new Set<string>();
  for (let i = 0; i < rawUpdates.length; i++) {
    const update = rawUpdates[i];
    if (!update || typeof update !== "object") return { ok: false, error: `updates[${i}] must be an object` };
    const rec = update as Record<string, unknown>;
    if (typeof rec.id !== "string" || !rec.id) return { ok: false, error: `updates[${i}].id must be a non-empty string` };
    if (seen.has(rec.id)) return { ok: false, error: `updates[${i}].id is duplicated` };
    seen.add(rec.id);
    const target = next.find((todo) => todo.id === rec.id);
    if (!target) {
      return {
        ok: false,
        error: `updates[${i}].id "${rec.id}" does not match an existing todo; current IDs: ${formatAvailableIds(current)}`,
      };
    }
    if (rec.content === undefined && rec.status === undefined && rec.priority === undefined) {
      return { ok: false, error: `updates[${i}] must change content, status, or priority` };
    }
    if (rec.content !== undefined) target.content = rec.content as string;
    if (rec.status !== undefined) target.status = rec.status as TodoStatus;
    if (rec.priority !== undefined) target.priority = rec.priority as TodoPriority;
  }
  return validateTodoWrite(next, current);
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

/** Count successfully finished items; cancelled items are intentionally excluded. */
export function countCompletedTodos(todos: readonly TodoItem[]): number {
  return todos.filter((todo) => todo.status === "completed").length;
}
