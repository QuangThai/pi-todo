export const TODO_STATUSES = ["pending", "in_progress", "completed", "cancelled"] as const;
export type TodoStatus = (typeof TODO_STATUSES)[number];

export const TODO_PRIORITIES = ["high", "medium", "low"] as const;
export type TodoPriority = (typeof TODO_PRIORITIES)[number];

export const TERMINAL_STATUSES: ReadonlySet<TodoStatus> = new Set(["completed", "cancelled"]);

export interface TodoItem {
  content: string;
  status: TodoStatus;
  priority: TodoPriority;
}

export interface TodoWriteDetails {
  todos: TodoItem[];
  error?: string;
  unchanged?: boolean;
}

export const TODO_STATE_ENTRY_TYPE = "pi-todo.state";
export const TOOL_WRITE = "todowrite";
export const TOOL_READ = "todoread";
export const WIDGET_KEY = "pi-todo";
export const MAX_OVERLAY_LINES = 12;
/** Max characters per todo content after sanitize (context/tool safety). */
export const MAX_CONTENT_LENGTH = 500;
/** Max todo lines echoed in todowrite/todoread text (full list still in details/JSON). */
export const MAX_RESULT_LINES = 40;
