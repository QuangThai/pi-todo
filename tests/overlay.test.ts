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
  it("drops terminal first on overflow (B5)", () => {
    const todos = [
      t("done1", "completed"),
      t("done2", "completed"),
      t("active", "in_progress"),
      t("p1", "pending"),
      t("p2", "pending"),
      t("p3", "pending"),
    ];
    // maxLines=4 → bodyBudget=3 → innerBudget=2 with +N more
    const layout = selectOverlayLayout(todos, 4);
    expect(layout.visible.some((x) => x.content === "active")).toBe(true);
    expect(layout.visible.every((x) => x.status !== "completed")).toBe(true);
    expect(layout.hiddenCount).toBeGreaterThan(0);
  });

  it("preserves order when fitting", () => {
    const todos = [t("a", "pending"), t("b", "in_progress"), t("c", "completed")];
    const layout = selectOverlayLayout(todos, 12);
    expect(layout.visible.map((x) => x.content)).toEqual(["a", "b", "c"]);
    expect(layout.hiddenCount).toBe(0);
  });

  it("keeps in_progress visible even when many pending overflow", () => {
    const todos = [
      t("active", "in_progress"),
      ...Array.from({ length: 20 }, (_, i) => t(`p${i}`, "pending")),
    ];
    const layout = selectOverlayLayout(todos, 5);
    expect(layout.visible.some((x) => x.status === "in_progress")).toBe(true);
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

  it("puts a blank line between heading and first todo row", () => {
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
