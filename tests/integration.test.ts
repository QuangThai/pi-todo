import { describe, expect, it, beforeEach } from "vitest";
import { getTodos, setTodos, clearTodos, __resetStore } from "../src/store.js";
import { validateTodoWrite, todosEqual } from "../src/validate.js";
import {
  formatTodoListText,
  renderOverlayLines,
  shouldShowOverlay,
  selectOverlayLayout,
} from "../src/format.js";
import type { TodoItem } from "../src/types.js";

const identityTheme = {
  fg: (_c: string, s: string) => s,
  bold: (s: string) => s,
  strikethrough: (s: string) => s,
} as unknown as import("@earendil-works/pi-coding-agent").Theme;

const t = (
  content: string,
  status: TodoItem["status"],
  priority: TodoItem["priority"] = "medium",
): TodoItem => ({ content, status, priority });

beforeEach(() => {
  __resetStore();
});

describe("write→read roundtrip", () => {
  it("writes valid todos and reads them back unchanged", () => {
    const raw = [
      { content: "Feature A", status: "completed" as const, priority: "high" as const },
      { content: "Feature B", status: "in_progress" as const, priority: "high" as const },
      { content: "Feature C", status: "pending" as const, priority: "medium" as const },
    ];

    const result = validateTodoWrite(raw, getTodos());
    expect(result.ok).toBe(true);
    expect(result.ok && result.todos).toHaveLength(3);

    if (result.ok) setTodos(result.todos);

    const stored = getTodos();
    expect(stored).toHaveLength(3);
    expect(stored[0].content).toBe("Feature A");
    expect(stored[1].status).toBe("in_progress");
    expect(stored[2].priority).toBe("medium");
  });

  it("rejects more than one in_progress", () => {
    const raw = [
      { content: "A", status: "in_progress", priority: "high" },
      { content: "B", status: "in_progress", priority: "high" },
    ];
    const result = validateTodoWrite(raw, getTodos());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("exactly one in_progress");
  });

  it("detects unchanged todos", () => {
    const raw = [
      { content: "Task", status: "pending", priority: "medium" },
    ];
    const r1 = validateTodoWrite(raw, getTodos());
    expect(r1.ok).toBe(true);
    if (r1.ok) setTodos(r1.todos);

    const r2 = validateTodoWrite(raw, getTodos());
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.unchanged).toBe(true);
  });

  it("clears todos via empty list", () => {
    setTodos([t("a", "pending")]);
    const result = validateTodoWrite([], getTodos());
    expect(result.ok).toBe(true);
    if (result.ok) {
      setTodos(result.todos);
      expect(getTodos()).toHaveLength(0);
    }
  });

  it("handles full write→read→write cycle", () => {
    // First write
    const r1 = validateTodoWrite(
      [{ content: "Step 1", status: "in_progress", priority: "high" }],
      getTodos(),
    );
    expect(r1.ok).toBe(true);
    if (r1.ok) setTodos(r1.todos);
    expect(getTodos()).toHaveLength(1);

    // Second write (full replace)
    const r2 = validateTodoWrite(
      [
        { content: "Step 1", status: "completed", priority: "high" },
        { content: "Step 2", status: "in_progress", priority: "medium" },
        { content: "Step 3", status: "pending", priority: "low" },
      ],
      getTodos(),
    );
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      setTodos(r2.todos);
      expect(getTodos()).toHaveLength(3);
      expect(getTodos()[0].status).toBe("completed");
      expect(getTodos()[1].status).toBe("in_progress");
      expect(getTodos()[2].status).toBe("pending");
    }
  });
});

describe("validate→store→format integration", () => {
  it("tool text output matches stored data", () => {
    const raw = [
      { content: "Design", status: "completed", priority: "high" },
      { content: "Implement", status: "in_progress", priority: "high" },
      { content: "Review", status: "pending", priority: "medium" },
    ];
    const r = validateTodoWrite(raw, getTodos());
    expect(r.ok).toBe(true);
    if (r.ok) setTodos(r.todos);

    // formatTodoListText should reflect stored
    const text = formatTodoListText(getTodos(), "2 open / 3 total");
    expect(text).toContain("2 open / 3 total");
    expect(text).toContain("[✓] Design");
    expect(text).toContain("[•] Implement");
    expect(text).toContain("[ ] Review");
  });

  it("overlay keeps store counts while retaining stored items", () => {
    setTodos([
      t("done", "completed"),
      t("active", "in_progress"),
      t("next", "pending"),
    ]);

    const lines = renderOverlayLines(getTodos(), identityTheme, 80);
    expect(lines[0]).toBe("# Todos (2 open, 1 running, 1 completed)");
    expect(lines).toContain("[•] active");
    expect(lines).toContain("[ ] next");
  });

  it("overlay hides when all items from store are terminal", () => {
    setTodos([t("a", "completed"), t("b", "cancelled")]);
    expect(shouldShowOverlay(getTodos())).toBe(false);
  });

  it("overlay preserves checklist sequence", () => {
    setTodos([
      t("Low prior", "pending", "low"),
      t("High prior", "in_progress", "high"),
      t("Med prior", "pending", "medium"),
    ]);

    const lines = renderOverlayLines(getTodos(), identityTheme, 80);
    // Timeline order is preserved as tasks move through their states.
    const idxInProgress = lines.findIndex((l) => l.includes("High prior"));
    const idxMed = lines.findIndex((l) => l.includes("Med prior"));
    const idxLow = lines.findIndex((l) => l.includes("Low prior"));
    expect(idxLow).toBeGreaterThan(0);
    expect(idxInProgress).toBeGreaterThan(idxLow);
    expect(idxMed).toBeGreaterThan(idxInProgress);
  });

  it("overflow summary counts terminal items without regrouping the timeline", () => {
    setTodos([
      t("active", "in_progress", "high"),
      t("done1", "completed", "low"),
      t("done2", "completed", "low"),
      t("done3", "completed", "low"),
      t("done4", "completed", "low"),
      t("done5", "completed", "low"),
    ]);

    const lines = renderOverlayLines(getTodos(), identityTheme, 80, { maxLines: 4 });
    expect(lines).toContain("[•] active");
    expect(lines.some((l) => l.includes("+5 more"))).toBe(true);
  });
});

describe("empty/edge integration", () => {
  it("empty store → no open work", () => {
    expect(getTodos()).toHaveLength(0);
    expect(shouldShowOverlay(getTodos())).toBe(false);
    expect(renderOverlayLines(getTodos(), identityTheme, 80)).toEqual([]);
  });

  it("invalid write does not modify store", () => {
    setTodos([t("existing", "in_progress")]);
    const bad = validateTodoWrite("not an array", getTodos());
    expect(bad.ok).toBe(false);
    expect(getTodos()).toHaveLength(1);
    expect(getTodos()[0].content).toBe("existing");
  });

  it("valid write replaces store even if priorities differ", () => {
    setTodos([t("old", "in_progress")]);
    const r = validateTodoWrite(
      [{ content: "new", status: "in_progress", priority: "low" }],
      getTodos(),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      setTodos(r.todos);
      expect(getTodos()).toHaveLength(1);
      expect(getTodos()[0].content).toBe("new");
      expect(getTodos()[0].priority).toBe("low");
    }
  });

  it("todosEqual detects differences", () => {
    const a = [t("x", "pending")];
    const b = [t("x", "in_progress")];
    expect(todosEqual(a, a)).toBe(true);
    expect(todosEqual(a, b)).toBe(false);
    expect(todosEqual([], [])).toBe(true);
  });
});
