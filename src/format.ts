import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import type { TodoItem, TodoStatus } from "./types.js";
import { MAX_OVERLAY_LINES, MAX_RESULT_LINES } from "./types.js";
import { countCompletedTodos, countOpenTodos, countRunningTodos, hasOpenTodos } from "./validate.js";


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
  const prefix = todo.id ? `${todo.id} ` : "";
  return `${getTodoMarker(todo.status)} ${prefix}${todo.content}`;
}

/** Compact checklist for tool responses; caps lines to keep LLM context small. */
export function formatTodoListText(todos: readonly TodoItem[], summary: string): string {
  if (todos.length === 0) return summary;

  // The list is a workflow timeline. Never reshuffle completed work after the
  // next task just because its status changed.
  const ordered = [...todos];

  if (todos.length <= MAX_RESULT_LINES) {
    return [summary, ...ordered.map(formatPlainTodoLine)].join("\n");
  }
  const shown = ordered.slice(0, MAX_RESULT_LINES);
  const hidden = ordered.length - MAX_RESULT_LINES;
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
  /** Active item repeated below the timeline when it is outside the visible prefix. */
  pinnedActive?: TodoItem;
  hiddenCount: number;
  /** Retained for consumers of the layout API; terminal items are no longer regrouped. */
  terminalCount: number;
}

/**
 * Fit the checklist timeline into the overlay without sorting by status or
 * priority. When the active task falls outside the visible prefix, repeat it
 * as a pinned "Active:" row rather than moving it ahead of earlier work.
 */
export function selectOverlayLayout(
  todos: readonly TodoItem[],
  maxLines: number = MAX_OVERLAY_LINES,
): OverlayLayout {
  if (!shouldShowOverlay(todos)) {
    return { visible: [], hiddenCount: 0, terminalCount: 0 };
  }

  const bodyBudget = Math.max(1, maxLines - 1);
  if (todos.length <= bodyBudget) {
    // All fit — show the canonical checklist sequence unchanged.
    return { visible: [...todos], hiddenCount: 0, terminalCount: 0 };
  }

  const active = todos.find((todo) => todo.status === "in_progress");
  // Reserve one row for the overflow summary. If the active task lies outside
  // the timeline prefix, reserve another row to pin it without reordering.
  let visibleCapacity = Math.max(0, bodyBudget - 1);
  let visible = todos.slice(0, visibleCapacity);
  let pinnedActive = active && !visible.includes(active) ? active : undefined;

  if (pinnedActive) {
    visibleCapacity = Math.max(0, bodyBudget - 2);
    visible = todos.slice(0, visibleCapacity);
    pinnedActive = active;
  }

  const hiddenCount = todos.length - visible.length - (pinnedActive ? 1 : 0);
  return { visible, pinnedActive, hiddenCount, terminalCount: 0 };
}

export interface RenderOverlayOptions {
  maxLines?: number;
}

/**
 * The overlay is hidden when no work remains open.
 */
export function renderOverlayLines(
  todos: readonly TodoItem[],
  theme: Theme,
  width: number,
  options: RenderOverlayOptions = {},
): string[] {
  if (!shouldShowOverlay(todos)) return [];

  const maxLines = Math.max(1, options.maxLines ?? MAX_OVERLAY_LINES);
  const truncate = (line: string) => truncateToWidth(line, width, "…");
  const open = countOpenTodos(todos);
  const running = countRunningTodos(todos);
  const completed = countCompletedTodos(todos);
  const heading = truncate(
    theme.fg("accent", theme.bold("# Todos")) +
      theme.fg("dim", ` (${open} open, ${running} running, ${completed} completed)`),
  );

  // Small gap between heading and first row — budget -1 to account for the blank line
  const layout = selectOverlayLayout(todos, Math.max(3, maxLines - 1));
  const lines: string[] = [heading, ""];

  for (const todo of layout.visible) {
    lines.push(truncate(formatThemedTodoLine(todo, theme)));
  }
  if (layout.pinnedActive) {
    lines.push(
      truncate(theme.fg("warning", `Active: ${formatPlainTodoLine(layout.pinnedActive)}`)),
    );
  }
  if (layout.hiddenCount > 0) {
    lines.push(truncate(theme.fg("dim", `+${layout.hiddenCount} more`)));
  }
  lines.push("");
  // Layout reserves content rows, but the heading and trailing spacer are
  // rendered here. Enforce the public maxLines contract at the final boundary.
  return lines.slice(0, maxLines);
}
