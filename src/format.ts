import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import type { TodoItem, TodoStatus } from "./types.js";
import { MAX_OVERLAY_LINES, MAX_RESULT_LINES } from "./types.js";
import { hasOpenTodos } from "./validate.js";

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

export interface PlainLineOptions {
  /** Append `(priority)`. Only todo_read needs it; mutations just echoed it back. */
  showPriority?: boolean;
}

export function formatPlainTodoLine(todo: TodoItem, options: PlainLineOptions = {}): string {
  const prefix = todo.id ? `${todo.id} ` : "";
  const suffix = options.showPriority ? ` (${todo.priority})` : "";
  return `${getTodoMarker(todo.status)} ${prefix}${todo.content}${suffix}`;
}

/**
 * Overlay row without the ID, mirroring `formatThemedTodoLine`.
 * The overlay is for the user, who has no use for the ID the model quotes.
 */
export function formatOverlayRow(todo: TodoItem): string {
  return `${getTodoMarker(todo.status)} ${todo.content}`;
}

/** Compact checklist for tool responses; caps lines to keep LLM context small. */
export function formatTodoListText(
  todos: readonly TodoItem[],
  summary: string,
  options: PlainLineOptions = {},
): string {
  if (todos.length === 0) return summary;

  // The list is a workflow timeline. Never reshuffle completed work after the
  // next task just because its status changed.
  const ordered = [...todos];

  if (todos.length <= MAX_RESULT_LINES) {
    return [summary, ...ordered.map((todo) => formatPlainTodoLine(todo, options))].join("\n");
  }
  const shown = ordered.slice(0, MAX_RESULT_LINES);
  const hidden = ordered.length - MAX_RESULT_LINES;
  return [
    summary,
    ...shown.map((todo) => formatPlainTodoLine(todo, options)),
    `… and ${hidden} more (full list in details)`,
  ].join("\n");
}

export function formatThemedTodoLine(todo: TodoItem, theme: Theme): string {
  const marker = getTodoMarker(todo.status);
  if (todo.status === "in_progress") {
    return `${theme.fg("warning", marker)} ${theme.fg("warning", todo.content)}`;
  }
  if (todo.status === "completed" || todo.status === "cancelled") {
    return `${theme.fg("dim", marker)} ${theme.fg("dim", theme.strikethrough(todo.content))}`;
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
    return { visible: [], hiddenCount: 0 };
  }

  const bodyBudget = Math.max(1, maxLines - 1);
  if (todos.length <= bodyBudget) {
    // All fit — show the canonical checklist sequence unchanged.
    return { visible: [...todos], hiddenCount: 0 };
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
  return { visible, pinnedActive, hiddenCount };
}

export interface RenderOverlayOptions {
  maxLines?: number;
}

const FIRST_PREFIX = "└ ";
const NEXT_PREFIX = "  ";

/**
 * Themed overlay body for the TUI widget. Empty when no work remains open.
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
  const heading = truncate(theme.fg("accent", theme.bold("Updated Plan")));

  // Tight spacing: heading directly above the tree branch (no blank line gap)
  const layout = selectOverlayLayout(todos, Math.max(3, maxLines - 1));
  const lines: string[] = [heading];

  for (let i = 0; i < layout.visible.length; i++) {
    const prefix = i === 0 ? FIRST_PREFIX : NEXT_PREFIX;
    lines.push(truncate(prefix + formatThemedTodoLine(layout.visible[i], theme)));
  }
  if (layout.pinnedActive) {
    lines.push(
      truncate(NEXT_PREFIX + theme.fg("warning", `Active: ${formatPlainTodoLine(layout.pinnedActive)}`)),
    );
  }
  if (layout.hiddenCount > 0) {
    lines.push(truncate(NEXT_PREFIX + theme.fg("dim", `+${layout.hiddenCount} more`)));
  }
  lines.push("");
  return lines.slice(0, maxLines);
}

/**
 * Unthemed overlay body, for hosts that cannot run a component factory.
 *
 * RPC mode drops factory widgets entirely (`setWidget` there only forwards a
 * string array), so without this the overlay is invisible to every non-TUI
 * front end. Same layout as the themed renderer, minus the escape codes.
 */
export function renderOverlayPlainLines(
  todos: readonly TodoItem[],
  options: RenderOverlayOptions = {},
): string[] {
  if (!shouldShowOverlay(todos)) return [];

  const maxLines = Math.max(1, options.maxLines ?? MAX_OVERLAY_LINES);
  const layout = selectOverlayLayout(todos, Math.max(3, maxLines - 1));
  const lines: string[] = ["Updated Plan"];

  for (let i = 0; i < layout.visible.length; i++) {
    const prefix = i === 0 ? FIRST_PREFIX : NEXT_PREFIX;
    lines.push(prefix + formatOverlayRow(layout.visible[i]));
  }
  if (layout.pinnedActive) {
    lines.push(`${NEXT_PREFIX}Active: ${formatPlainTodoLine(layout.pinnedActive)}`);
  }
  if (layout.hiddenCount > 0) {
    lines.push(`${NEXT_PREFIX}+${layout.hiddenCount} more`);
  }
  return lines.slice(0, maxLines);
}
