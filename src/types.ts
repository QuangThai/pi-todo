export const TODO_STATUSES = ["pending", "in_progress", "completed", "cancelled"] as const;
export type TodoStatus = (typeof TODO_STATUSES)[number];

export const TODO_PRIORITIES = ["high", "medium", "low"] as const;
export type TodoPriority = (typeof TODO_PRIORITIES)[number];

/** Applied when a payload omits `priority`, which the schema allows. */
export const DEFAULT_PRIORITY: TodoPriority = "medium";

export const TERMINAL_STATUSES: ReadonlySet<TodoStatus> = new Set(["completed", "cancelled"]);

export interface TodoItem {
  /** Stable identity; absent only in legacy session entries until their next mutation. */
  id?: string;
  content: string;
  status: TodoStatus;
  priority: TodoPriority;
}

export interface TodoWriteDetails {
  todos: TodoItem[];
  error?: string;
  warnings?: string[];
  unchanged?: boolean;
}

export interface TodoReadDetails {
  todos: TodoItem[];
}

export const TODO_STATE_ENTRY_TYPE = "pi-todo.state";
export const TOOL_WRITE = "todo_write";
export const TOOL_READ = "todo_read";
export const TOOL_UPDATE = "todo_update";

/** User-facing surfaces. Diagnostics are a user concern, so they are a command. */
export const COMMAND_TODOS = "todos";
export const COMMAND_DIAGNOSE = "todo-diagnose";
export const FLAG_NO_NUDGES = "no-todo-nudges";

export const WIDGET_KEY = "pi-todo";
export const STATUS_KEY = "pi-todo";
/** Matches pi's own per-widget budget (InteractiveMode.MAX_WIDGET_LINES). */
export const MAX_OVERLAY_LINES = 10;
/** Max characters per todo content after sanitize (context/tool safety). */
export const MAX_CONTENT_LENGTH = 500;
/** Bound mutation payloads and persisted snapshots to keep tool context manageable. */
export const MAX_TODO_ITEMS = 200;
/** Max todo lines echoed in tool result text (full list still in details). */
export const MAX_RESULT_LINES = 40;
