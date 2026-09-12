/**
 * Lenient argument preparation, run by pi via `prepareArguments` *before* schema
 * validation.
 *
 * The public schema stays strict. This layer only folds shapes models actually
 * produce into that schema, so a near-miss costs a coercion instead of a whole
 * wasted turn: `status: "done"`, `priority: "P1"`, a single object where an
 * array is expected, or the whole argument object handed over as a JSON string.
 *
 * Rules: never throw, never invent a field that was not supplied, and leave
 * anything ambiguous untouched so validation can report it properly.
 */

const STATUS_ALIASES: Readonly<Record<string, string>> = {
  done: "completed",
  complete: "completed",
  completed: "completed",
  finished: "completed",
  closed: "completed",
  in_progress: "in_progress",
  inprogress: "in_progress",
  "in-progress": "in_progress",
  "in progress": "in_progress",
  active: "in_progress",
  doing: "in_progress",
  started: "in_progress",
  wip: "in_progress",
  pending: "pending",
  todo: "pending",
  open: "pending",
  not_started: "pending",
  "not-started": "pending",
  "not started": "pending",
  queued: "pending",
  cancelled: "cancelled",
  canceled: "cancelled",
  skipped: "cancelled",
  abandoned: "cancelled",
  wontfix: "cancelled",
  "won't do": "cancelled",
};

const PRIORITY_ALIASES: Readonly<Record<string, string>> = {
  high: "high",
  p0: "high",
  p1: "high",
  urgent: "high",
  critical: "high",
  highest: "high",
  medium: "medium",
  p2: "medium",
  normal: "medium",
  med: "medium",
  default: "medium",
  low: "low",
  p3: "low",
  p4: "low",
  minor: "low",
  lowest: "low",
  nice_to_have: "low",
};

/** Field names models reach for instead of `content`. */
const CONTENT_ALIASES = ["text", "task", "title", "name", "description", "todo"] as const;
/** Field names models reach for instead of `id`. */
const ID_ALIASES = ["todo_id", "todoId", "itemId", "item_id", "taskId", "task_id"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Parse a JSON string argument; returns undefined when it is not JSON. */
function parseJsonish(value: unknown): unknown {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

function normalizeKey(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const key = value.trim().toLowerCase().replace(/\s+/g, " ");
  return key.length > 0 ? key : undefined;
}

export function coerceStatus(value: unknown): unknown {
  const key = normalizeKey(value);
  if (key === undefined) return value;
  return STATUS_ALIASES[key] ?? value;
}

export function coercePriority(value: unknown): unknown {
  const key = normalizeKey(value);
  if (key === undefined) return value;
  return PRIORITY_ALIASES[key] ?? value;
}

/** Coerce one array-ish argument into an array without inventing entries. */
function toArray(value: unknown): unknown {
  const parsed = parseJsonish(value);
  const candidate = parsed ?? value;
  if (Array.isArray(candidate)) return candidate;
  // A single item where a list was expected is unambiguous — wrap it.
  if (isRecord(candidate)) return [candidate];
  return value;
}

function coerceTodoItem(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;
  const item: Record<string, unknown> = { ...raw };

  if (typeof item.content !== "string") {
    for (const alias of CONTENT_ALIASES) {
      if (typeof item[alias] === "string") {
        item.content = item[alias];
        delete item[alias];
        break;
      }
    }
  }
  if (item.status !== undefined) item.status = coerceStatus(item.status);
  if (item.priority !== undefined) item.priority = coercePriority(item.priority);
  // A null/empty priority means "unspecified"; the schema allows omitting it.
  if (item.priority === null || item.priority === "") delete item.priority;
  // Same for a null id — dropping it makes the item a new entry rather than an error.
  if (item.id === null || item.id === "") delete item.id;
  if (item.id === undefined) {
    for (const alias of ID_ALIASES) {
      if (typeof item[alias] === "string" && item[alias]) {
        item.id = item[alias];
        delete item[alias];
        break;
      }
    }
  }
  return item;
}

function coerceUpdateItem(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;
  const update: Record<string, unknown> = { ...raw };
  if (update.id === undefined) {
    for (const alias of ID_ALIASES) {
      if (typeof update[alias] === "string" && update[alias]) {
        update.id = update[alias];
        delete update[alias];
        break;
      }
    }
  }
  if (update.status !== undefined) update.status = coerceStatus(update.status);
  if (update.priority !== undefined) update.priority = coercePriority(update.priority);
  if (update.priority === null) delete update.priority;
  if (update.content === undefined) {
    for (const alias of CONTENT_ALIASES) {
      if (typeof update[alias] === "string") {
        update.content = update[alias];
        delete update[alias];
        break;
      }
    }
  }
  return update;
}

/** `prepareArguments` for todo_write. */
export function prepareTodoWriteArgs(args: unknown): unknown {
  const parsed = parseJsonish(args);
  const candidate = parsed ?? args;

  // A bare list where the wrapper object was expected is unambiguous.
  if (Array.isArray(candidate)) {
    return { todos: candidate.map(coerceTodoItem) };
  }
  if (!isRecord(candidate)) return args;

  const out: Record<string, unknown> = { ...candidate };
  // Some models send the list under a different but obvious name.
  if (out.todos === undefined) {
    for (const alias of ["items", "list", "tasks", "todo_list", "todoList"]) {
      if (out[alias] !== undefined) {
        out.todos = out[alias];
        delete out[alias];
        break;
      }
    }
  }
  if (out.todos === undefined) return out;

  const todos = toArray(out.todos);
  out.todos = Array.isArray(todos) ? todos.map(coerceTodoItem) : todos;
  return out;
}

/** `prepareArguments` for todo_update. */
export function prepareTodoUpdateArgs(args: unknown): unknown {
  const parsed = parseJsonish(args);
  const candidate = parsed ?? args;

  if (Array.isArray(candidate)) {
    return { updates: candidate.map(coerceUpdateItem) };
  }
  if (!isRecord(candidate)) return args;

  const out: Record<string, unknown> = { ...candidate };
  if (out.updates === undefined) {
    for (const alias of ["patches", "items", "todos", "changes"]) {
      if (out[alias] !== undefined) {
        out.updates = out[alias];
        delete out[alias];
        break;
      }
    }
  }
  // A bare single patch (`{ id, status }`) with no wrapper is unambiguous.
  if (
    out.updates === undefined &&
    (typeof out.id === "string" || ID_ALIASES.some((a) => typeof out[a] === "string"))
  ) {
    return { updates: [coerceUpdateItem(out)] };
  }
  if (out.updates === undefined) return out;

  const updates = toArray(out.updates);
  out.updates = Array.isArray(updates) ? updates.map(coerceUpdateItem) : updates;
  return out;
}
