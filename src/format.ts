import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import type { TodoItem, TodoStatus } from "./types.js";
import { MAX_OVERLAY_LINES, MAX_RESULT_LINES } from "./types.js";
import { countOpenTodos, countRunningTodos, hasOpenTodos, isTerminalStatus } from "./validate.js";

const PRIORITY_RANK: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function prioritySort(a: TodoItem, b: TodoItem): number {
  return (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2);
}

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

  // in_progress first, then pending (sorted by priority), then terminal
  const sorted = [...todos].sort((a, b) => {
    const statusRank: Record<string, number> = {
      in_progress: 0,
      pending: 1,
      completed: 2,
      cancelled: 2,
    };
    const diff =
      (statusRank[a.status] ?? 2) - (statusRank[b.status] ?? 2);
    if (diff !== 0) return diff;
    return prioritySort(a, b);
  });

  if (todos.length <= MAX_RESULT_LINES) {
    return [summary, ...sorted.map(formatPlainTodoLine)].join("\n");
  }
  const shown = sorted.slice(0, MAX_RESULT_LINES);
  const hidden = sorted.length - MAX_RESULT_LINES;
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
  terminalCount: number;
}

/**
 * Fit into maxLines (includes heading). On overflow, collapse terminal items
 * into a "+N done" line. Within each status group, items are sorted by
 * priority (high → medium → low).
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
    // All fit — show everything
    return { visible: [...todos].sort(prioritySort), hiddenCount: 0, terminalCount: 0 };
  }

  const innerBudget = Math.max(1, bodyBudget - 1);
  const inProgress = todos.filter((t) => t.status === "in_progress").sort(prioritySort);
  const pending = todos.filter((t) => t.status === "pending").sort(prioritySort);
  const terminal = todos.filter((t) => isTerminalStatus(t.status)).sort(prioritySort);

  const picked: TodoItem[] = [];
  const addPicked = (items: TodoItem[]) => {
    for (const t of items) {
      if (picked.length >= innerBudget) break;
      picked.push(t);
    }
  };

  addPicked(inProgress);
  addPicked(pending);

  // Collapse terminal items: only show them individually if there's room
  if (terminal.length > 0 && picked.length < innerBudget) {
    addPicked(terminal);
  }

  const terminalCollapsed = terminal.length > 0 && picked.length >= innerBudget;
  const remaining = todos.length - picked.length;
  const hiddenCount = terminalCollapsed ? remaining : Math.max(0, remaining - terminal.length);

  return { visible: picked, hiddenCount, terminalCount: terminalCollapsed ? terminal.length : 0 };
}

export interface RenderOverlayOptions {
  maxLines?: number;
}

/**
 * Heading counts (when overlay is visible):
 * - open    = pending + in_progress
 * - running = in_progress only (0 or 1 after a valid todo_write)
 * Overlay is hidden when open === 0, so "(0 open, 0 running)" is never shown.
 * Includes a visual progress bar: completed / total.
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
  const total = todos.length;
  const done = total - open;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const barWidth = Math.max(4, Math.min(12, Math.floor(width / 8)));
  const filled = Math.round((barWidth * done) / total);
  const bar = "#".repeat(filled) + "·".repeat(Math.max(0, barWidth - filled));

  const heading = truncate(
    theme.fg("accent", theme.bold(`# Todos`)) +
      theme.fg("dim", ` (${open} open, ${running} running)`) +
      theme.fg("muted", ` ${bar} ${pct}%`),
  );

  // Small gap between heading and first row — budget -1 to account for the blank line
  const layout = selectOverlayLayout(todos, Math.max(3, maxLines - 1));
  const lines: string[] = [heading, ""];

  for (const todo of layout.visible) {
    lines.push(truncate(formatThemedTodoLine(todo, theme)));
  }
  if (layout.terminalCount > 0) {
    lines.push(truncate(theme.fg("dim", `+${layout.terminalCount} done`)));
  }
  if (layout.hiddenCount > 0) {
    lines.push(truncate(theme.fg("dim", `+${layout.hiddenCount} more`)));
  }
  lines.push("");
  return lines;
}
