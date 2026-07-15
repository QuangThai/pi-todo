import { describe, expect, it } from "vitest";
import {
  getTodoMarker,
  selectOverlayLayout,
  shouldShowOverlay,
  formatPlainTodoLine,
  formatTodoListText,
  renderOverlayLines,
} from "../src/format.js";
import type { TodoItem } from "../src/types.js";
import { MAX_RESULT_LINES } from "../src/types.js";
import { countOpenTodos, countRunningTodos } from "../src/validate.js";

const identityTheme = {
  fg: (_c: string, s: string) => s,
  bold: (s: string) => s,
  strikethrough: (s: string) => s,
} as unknown as import("@earendil-works/pi-coding-agent").Theme;

const t = (content: string, status: TodoItem["status"], priority: TodoItem["priority"] = "medium"): TodoItem => ({
  content,
  status,
  priority,
});

describe("markers", () => {
  it("matches OpenCode-style glyphs", () => {
    expect(getTodoMarker("pending")).toBe("[ ]");
    expect(getTodoMarker("in_progress")).toBe("[•]");
    expect(getTodoMarker("completed")).toBe("[✓]");
    expect(getTodoMarker("cancelled")).toBe("[×]");
  });
});

describe("shouldShowOverlay", () => {
  it("hides when empty (B3)", () => {
    expect(shouldShowOverlay([])).toBe(false);
  });

  it("hides when all completed (B2)", () => {
    expect(shouldShowOverlay([t("a", "completed"), t("b", "completed")])).toBe(false);
  });

  it("hides when only cancelled (B4)", () => {
    expect(shouldShowOverlay([t("a", "cancelled")])).toBe(false);
  });

  it("hides when completed + cancelled only", () => {
    expect(shouldShowOverlay([t("a", "completed"), t("b", "cancelled")])).toBe(false);
  });

  it("shows mix of open + completed (B1)", () => {
    expect(shouldShowOverlay([t("a", "completed"), t("b", "pending")])).toBe(true);
  });

  it("shows in_progress", () => {
    expect(shouldShowOverlay([t("a", "in_progress")])).toBe(true);
  });
});

describe("open / running counts", () => {
  it("open = pending + in_progress; running = in_progress only", () => {
    const todos = [
      t("done", "completed"),
      t("active", "in_progress"),
      t("next", "pending"),
      t("nope", "cancelled"),
    ];
    expect(countOpenTodos(todos)).toBe(2);
    expect(countRunningTodos(todos)).toBe(1);
  });

  it("pending-only → open=N, running=0", () => {
    const todos = [t("a", "pending"), t("b", "pending"), t("c", "pending")];
    expect(countOpenTodos(todos)).toBe(3);
    expect(countRunningTodos(todos)).toBe(0);
  });

  it("single in_progress → open=1, running=1", () => {
    const todos = [t("only", "in_progress")];
    expect(countOpenTodos(todos)).toBe(1);
    expect(countRunningTodos(todos)).toBe(1);
  });

  it("terminal-only → open=0, running=0", () => {
    const todos = [t("a", "completed"), t("b", "cancelled")];
    expect(countOpenTodos(todos)).toBe(0);
    expect(countRunningTodos(todos)).toBe(0);
  });

  it("empty → open=0, running=0", () => {
    expect(countOpenTodos([])).toBe(0);
    expect(countRunningTodos([])).toBe(0);
  });

  it("invariant: running <= open", () => {
    const cases: TodoItem[][] = [
      [],
      [t("a", "pending")],
      [t("a", "in_progress")],
      [t("a", "pending"), t("b", "in_progress"), t("c", "completed")],
      [t("a", "completed"), t("b", "cancelled")],
    ];
    for (const todos of cases) {
      expect(countRunningTodos(todos)).toBeLessThanOrEqual(countOpenTodos(todos));
    }
  });
});

describe("selectOverlayLayout", () => {
  it("keeps the earliest timeline items and pins an active item outside the prefix", () => {
    const todos = [
      t("done1", "completed"),
      t("done2", "completed"),
      t("active", "in_progress"),
      t("p1", "pending"),
      t("p2", "pending"),
      t("p3", "pending"),
    ];
    const layout = selectOverlayLayout(todos, 4);
    expect(layout.visible.map((x) => x.content)).toEqual(["done1"]);
    expect(layout.pinnedActive?.content).toBe("active");
    expect(layout.hiddenCount).toBeGreaterThan(0);
  });

    it("preserves checklist sequence when all items fit", () => {
      const todos = [t("a", "pending"), t("b", "in_progress"), t("c", "completed")];
      const layout = selectOverlayLayout(todos, 12);
      expect(layout.visible.map((x) => x.content)).toEqual(["a", "b", "c"]);
      expect(layout.hiddenCount).toBe(0);
    });

  it("keeps in_progress visible when it is within the timeline prefix", () => {
    const todos = [
      t("active", "in_progress"),
      ...Array.from({ length: 20 }, (_, i) => t(`p${i}`, "pending")),
    ];
    const layout = selectOverlayLayout(todos, 5);
      expect(layout.visible.some((x) => x.status === "in_progress")).toBe(true);
    expect(layout.pinnedActive).toBeUndefined();
  });
});

describe("formatPlainTodoLine", () => {
  it("formats marker + content", () => {
    expect(formatPlainTodoLine(t("Build overlay", "in_progress"))).toBe("[•] Build overlay");
  });
});

describe("renderOverlayLines", () => {
  it("includes open and running counts in heading", () => {
    const lines = renderOverlayLines(
      [t("a", "completed"), t("b", "in_progress"), t("c", "pending")],
      identityTheme,
      80,
    );
    expect(lines[0]).toContain("# Todos");
    expect(lines[0]).toContain("(2 open, 1 running)");
  });

  it("has a minimal blank-line gap between heading and first todo row", () => {
    const lines = renderOverlayLines(
      [t("a", "completed"), t("b", "in_progress"), t("c", "pending")],
      identityTheme,
      80,
    );
    expect(lines[0]).toContain("# Todos");
    expect(lines[1]).toBe("");
    expect(lines[2]).toMatch(/^\[/);
  });

  it("shows 0 running when none in_progress", () => {
    const lines = renderOverlayLines([t("a", "pending"), t("b", "pending")], identityTheme, 80);
    expect(lines[0]).toContain("(2 open, 0 running)");
  });

  it("shows 1 open, 1 running for solo in_progress", () => {
    const lines = renderOverlayLines([t("solo", "in_progress")], identityTheme, 80);
    expect(lines[0]).toContain("(1 open, 1 running)");
  });

  it("returns empty when no open work (never shows 0 open heading)", () => {
    expect(renderOverlayLines([t("a", "completed"), t("b", "cancelled")], identityTheme, 80)).toEqual(
      [],
    );
    expect(renderOverlayLines([], identityTheme, 80)).toEqual([]);
  });

  it("never exceeds maxLines when an active item is pinned during overflow", () => {
    const lines = renderOverlayLines(
      [
        t("done-1", "completed"),
        t("done-2", "completed"),
        t("active", "in_progress"),
        t("next", "pending"),
      ],
      identityTheme,
      80,
      { maxLines: 5 },
    );
    expect(lines).toHaveLength(5);
    expect(lines).toContain("Active: [•] active");
    expect(lines.some((line) => line.includes("+2 more"))).toBe(true);
  });

  it("counts ignore completed/cancelled for open/running", () => {
    const lines = renderOverlayLines(
      [
        t("done", "completed"),
        t("drop", "cancelled"),
        t("go", "in_progress"),
        t("next", "pending"),
        t("later", "pending"),
      ],
      identityTheme,
      80,
    );
    expect(lines[0]).toContain("(3 open, 1 running)");
  });
});

describe("formatTodoListText", () => {
  it("truncates long lists with +N more", () => {
    const todos = Array.from({ length: MAX_RESULT_LINES + 5 }, (_, i) =>
      t(`item ${i}`, "pending"),
    );
    const text = formatTodoListText(todos, "45 open / 45 total");
    expect(text).toContain("45 open / 45 total");
    expect(text).toContain("… and 5 more");
    expect(text.split("\n").length).toBe(MAX_RESULT_LINES + 2); // summary + items + more
  });
});

describe("selectOverlayLayout overflow edge cases", () => {
    it("does not regroup terminal items on overflow", () => {
    const todos = [
      t("ip", "in_progress"),
      t("p1", "pending"),
      t("p2", "pending"),
      t("c1", "completed"),
      t("c2", "completed"),
      t("c3", "completed"),
    ];
    const layout = selectOverlayLayout(todos, 5);
    expect(layout.visible).toHaveLength(3);
    expect(layout.visible.map((todo) => todo.content)).toEqual(["ip", "p1", "p2"]);
    expect(layout.terminalCount).toBe(0);
    expect(layout.hiddenCount).toBe(3);
  });

    it("counts every omitted item in one non-overlapping overflow summary", () => {
    const todos = [
      t("ip", "in_progress"),
      t("p1", "pending"),
      t("p2", "pending"),
      t("p3", "pending"),
      t("p4", "pending"),
      t("c1", "completed"),
      t("c2", "completed"),
    ];
    const layout = selectOverlayLayout(todos, 5);
    expect(layout.visible).toHaveLength(3);
    expect(layout.terminalCount).toBe(0);
    expect(layout.hiddenCount).toBe(4);
  });

  it("no terminal items: only +N more shown", () => {
    const todos = Array.from({ length: 10 }, (_, i) => t(`p${i}`, "pending"));
    const layout = selectOverlayLayout(todos, 5);
    expect(layout.terminalCount).toBe(0);
    expect(layout.hiddenCount).toBeGreaterThan(0);
  });

    it("renders a pinned Active row without changing timeline order", () => {
      const todos = [
        t("done-1", "completed"),
        t("done-2", "completed"),
        t("active", "in_progress"),
        t("next", "pending"),
      ];
      const lines = renderOverlayLines(todos, identityTheme, 80, { maxLines: 5 });
      expect(lines).toContain("[✓] done-1");
      expect(lines).toContain("Active: [•] active");
      expect(lines).not.toContain("[✓] done-2");
    });

    it("preserves completed work before the active follow-up when all items fit", () => {
    const todos = [
      t("c1", "completed"),
      t("c2", "completed"),
      t("c3", "completed"),
      t("c4", "completed"),
      t("c5", "completed"),
      t("ip", "in_progress"),
    ];
    const layout = selectOverlayLayout(todos, 7);
    expect(layout.visible.map((todo) => todo.content)).toEqual(["c1", "c2", "c3", "c4", "c5", "ip"]);
  });

    it("preserves original sequence instead of regrouping by status or priority", () => {
    const todos = [
      t("low-pending", "pending", "low"),
      t("high-ip", "in_progress", "high"),
      t("medium-pending", "pending", "medium"),
      t("high-completed", "completed", "high"),
      t("low-ip", "in_progress", "low"),
    ];
    const layout = selectOverlayLayout(todos, 10);
    const contents = layout.visible.map((x) => x.content);
    expect(contents).toEqual(todos.map((todo) => todo.content));
  });
});

describe("formatTodoListText timeline order", () => {
    it("keeps completed, pending, and running items in checklist sequence", () => {
    const todos = [
      t("completed", "completed"),
      t("pending", "pending"),
      t("in_progress", "in_progress"),
    ];
    const text = formatTodoListText(todos, "summary");
    const lines = text.split("\n");
    expect(lines[1]).toContain("[✓]");
    expect(lines[2]).toContain("[ ]");
    expect(lines[3]).toContain("[•]");
  });

    it("overflow keeps the earliest checklist items", () => {
    const todos = [
      t("done", "completed"),
      ...Array.from({ length: MAX_RESULT_LINES + 2 }, (_, i) => t(`p${i}`, "pending")),
      t("active", "in_progress"),
    ];
    const text = formatTodoListText(todos, "summary");
    const lines = text.split("\n");
    expect(lines[1]).toContain("[✓]");
    expect(lines[1]).toContain("done");
  });
});
