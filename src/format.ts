import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import type { TodoItem, TodoStatus } from "./types.js";
import { MAX_OVERLAY_LINES, MAX_RESULT_LINES } from "./types.js";
import { countOpenTodos, countRunningTodos, hasOpenTodos, isTerminalStatus } from "./validate.js";

export function getTodoMarker(status: TodoStatus): string {
  switch (status) {
    case "completed":
      return "[✓]";
    case "in_progress":
      return "[•]";
    case "cancelled":
      return "[×]";
    default:
      return "[ ]";
  }
}

export function formatPlainTodoLine(todo: TodoItem): string {
  return `${getTodoMarker(todo.status)} ${todo.content}`;
}

/** Compact checklist for tool responses; caps lines to keep LLM context small. */
export function formatTodoListText(todos: readonly TodoItem[], summary: string): string {
  if (todos.length === 0) return summary;
  if (todos.length <= MAX_RESULT_LINES) {
    return [summary, ...todos.map(formatPlainTodoLine)].join("\n");
  }
  const shown = todos.slice(0, MAX_RESULT_LINES);
  const hidden = todos.length - MAX_RESULT_LINES;
  return [
    summary,
    ...shown.map(formatPlainTodoLine),
    `… and ${hidden} more (full list in details/JSON)`,
  ].join("\n");
}

export function formatThemedTodoLine(todo: TodoItem, theme: Theme): string {
  const marker = getTodoMarker(todo.status);
  if (todo.status === "in_progress") {
    return `${theme.fg("warning", marker)} ${theme.fg("warning", todo.content)}`;
  }
  if (todo.status === "completed" || todo.status === "cancelled") {
    return `${theme.fg("dim", marker)} ${theme.fg("dim", todo.content)}`;
  }
  return `${theme.fg("muted", marker)} ${theme.fg("muted", todo.content)}`;
}

/** Show overlay while any pending/in_progress remains. */
export function shouldShowOverlay(todos: readonly TodoItem[]): boolean {
  return hasOpenTodos(todos);
}

export interface OverlayLayout {
  visible: TodoItem[];
  hiddenCount: number;
}

/**
 * Fit into maxLines (includes heading). On overflow, drop terminal first,
 * then pending from the end; keep in_progress. Preserve original order.
 */
export function selectOverlayLayout(
  todos: readonly TodoItem[],
  maxLines: number = MAX_OVERLAY_LINES,
): OverlayLayout {
  if (!shouldShowOverlay(todos)) {
    return { visible: [], hiddenCount: 0 };
  }

  const bodyBudget = Math.max(1, maxLines - 1);
  if (todos.length <= bodyBudget) {
    return { visible: [...todos], hiddenCount: 0 };
  }

  const innerBudget = Math.max(1, bodyBudget - 1);
  const inProgress = todos.filter((t) => t.status === "in_progress");
  const pending = todos.filter((t) => t.status === "pending");
  const terminal = todos.filter((t) => isTerminalStatus(t.status));

  const picked = new Set<TodoItem>();
  for (const t of inProgress) {
    if (picked.size >= innerBudget) break;
    picked.add(t);
  }
  for (const t of pending) {
    if (picked.size >= innerBudget) break;
    picked.add(t);
  }
  for (const t of terminal) {
    if (picked.size >= innerBudget) break;
    picked.add(t);
  }

  const visible = todos.filter((t) => picked.has(t));
  return { visible, hiddenCount: todos.length - visible.length };
}

export interface RenderOverlayOptions {
  maxLines?: number;
}

/**
 * Heading counts (when overlay is visible):
 * - open    = pending + in_progress
 * - running = in_progress only (0 or 1 after a valid todowrite)
 * Overlay is hidden when open === 0, so "(0 open, 0 running)" is never shown.
 */
export function renderOverlayLines(
  todos: readonly TodoItem[],
  theme: Theme,
  width: number,
  options: RenderOverlayOptions = {},
): string[] {
  if (!shouldShowOverlay(todos)) return [];

  const maxLines = options.maxLines ?? MAX_OVERLAY_LINES;
  const truncate = (line: string) => truncateToWidth(line, width, "…");
  const open = countOpenTodos(todos);
  const running = countRunningTodos(todos);
  const heading = truncate(
    theme.fg("accent", theme.bold(`# Todos`)) +
      theme.fg("dim", ` (${open} open, ${running} running)`),
  );

  // Reserve heading + blank gap under heading so the title isn't flush with rows.
  const layout = selectOverlayLayout(todos, Math.max(3, maxLines - 1));
  const lines: string[] = [heading, ""];

  for (const todo of layout.visible) {
    lines.push(truncate(formatThemedTodoLine(todo, theme)));
  }
  if (layout.hiddenCount > 0) {
    lines.push(truncate(theme.fg("dim", `+${layout.hiddenCount} more`)));
  }
  lines.push("");
  return lines;
}
