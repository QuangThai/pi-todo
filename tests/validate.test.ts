import { describe, expect, it } from "vitest";
import { sanitizeTodoText } from "../src/sanitize.js";
import { ensureTodoIds, getTodoIntegrityIssues, validateTodoWrite, hasOpenTodos, todosEqual } from "../src/validate.js";
import { MAX_TODO_ITEMS, type TodoItem } from "../src/types.js";

const sample = (overrides: Partial<TodoItem> = {}): TodoItem => ({
  content: "Do thing",
  status: "pending",
  priority: "medium",
  ...overrides,
});

describe("sanitizeTodoText", () => {
  it("strips ansi and collapses whitespace", () => {
    expect(sanitizeTodoText("\u001b[31mhello\u001b[0m\nworld")).toBe("hello world");
  });

  it("trims empty to empty", () => {
    expect(sanitizeTodoText("   \n\t  ")).toBe("");
  });
});

describe("validateTodoWrite", () => {
  it("rejects >1 in_progress (A1)", () => {
    const result = validateTodoWrite(
      [
        sample({ content: "a", status: "in_progress" }),
        sample({ content: "b", status: "in_progress" }),
      ],
      [],
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/exactly one in_progress/);
  });

  it("allows zero in_progress with open todos (A2)", () => {
    const result = validateTodoWrite([sample({ content: "a" }), sample({ content: "b" })], []);
    expect(result.ok).toBe(true);
  });

  it("allows empty list (A5)", () => {
    const result = validateTodoWrite([], [sample()]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.todos).toEqual([]);
  });

  it("rejects empty content (A6)", () => {
    const result = validateTodoWrite([{ content: "  ", status: "pending", priority: "low" }], []);
    expect(result.ok).toBe(false);
  });

  it("rejects unknown status (A7)", () => {
    const result = validateTodoWrite([{ content: "x", status: "deleted", priority: "low" }], []);
    expect(result.ok).toBe(false);
  });

  it("rejects missing priority (A8)", () => {
    const result = validateTodoWrite([{ content: "x", status: "pending" }], []);
    expect(result.ok).toBe(false);
  });

  it("flags unchanged rewrite (A11)", () => {
    const current = [sample({ content: "a", status: "in_progress", priority: "high" })];
    const result = validateTodoWrite(
      [{ content: "a", status: "in_progress", priority: "high" }],
      current,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.unchanged).toBe(true);
  });

  it("sanitizes content", () => {
    const result = validateTodoWrite(
      [{ content: "  hello\nworld  ", status: "pending", priority: "medium" }],
      [],
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.todos[0].content).toBe("hello world");
  });

  it("truncates content over MAX_CONTENT_LENGTH", () => {
    const long = "x".repeat(600);
    const result = validateTodoWrite(
      [{ content: long, status: "pending", priority: "low" }],
      [],
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.todos[0].content.length).toBe(500);
      expect(result.todos[0].content.endsWith("…")).toBe(true);
    }
  });
});

describe("hasOpenTodos / todosEqual", () => {
  it("hasOpenTodos false when all terminal", () => {
    expect(
      hasOpenTodos([
        sample({ status: "completed" }),
        sample({ content: "x", status: "cancelled" }),
      ]),
    ).toBe(false);
  });

  it("todosEqual compares fields", () => {
    expect(todosEqual([sample()], [sample()])).toBe(true);
    expect(todosEqual([sample()], [sample({ priority: "high" })])).toBe(false);
  });
});

describe("validateTodoWrite duplicate IDs", () => {
  it("rejects two items with same id", () => {
    const result = validateTodoWrite(
      [
        { content: "a", status: "pending", priority: "high", id: "dup" },
        { content: "b", status: "pending", priority: "low", id: "dup" },
      ],
      [],
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/duplicated/);
  });

  it("rejects three items with same id", () => {
    const result = validateTodoWrite(
      [
        { content: "a", status: "pending", priority: "high", id: "x" },
        { content: "b", status: "pending", priority: "low", id: "x" },
        { content: "c", status: "in_progress", priority: "medium", id: "x" },
      ],
      [],
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/duplicated/);
  });

  it("allows unique ids matching existing items", () => {
    const current: TodoItem[] = [
      { id: "aaa", content: "a", status: "pending", priority: "high" },
      { id: "bbb", content: "b", status: "pending", priority: "low" },
      { id: "ccc", content: "c", status: "pending", priority: "medium" },
    ];
    const result = validateTodoWrite(
      [
        { content: "a", status: "pending", priority: "high", id: "aaa" },
        { content: "b", status: "pending", priority: "low", id: "bbb" },
        { content: "c", status: "in_progress", priority: "medium", id: "ccc" },
      ],
      current,
    );
    expect(result.ok).toBe(true);
  });

  it("rejects unknown id not in current list", () => {
    const current: TodoItem[] = [
      { id: "known-1", content: "existing", status: "pending", priority: "high" },
    ];
    const result = validateTodoWrite(
      [
        { content: "existing", status: "pending", priority: "high", id: "known-1" },
        { content: "new task", status: "pending", priority: "low", id: "spoof" },
      ],
      current,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/does not match any existing todo/);
  });

  it("allows items without ids (auto-assign)", () => {
    const result = validateTodoWrite(
      [
        { content: "a", status: "pending", priority: "high" },
        { content: "b", status: "pending", priority: "low" },
      ],
      [],
    );
    expect(result.ok).toBe(true);
  });
});

describe("ensureTodoIds", () => {
  it("preserves ID when incoming item has explicit id", () => {
    const result = ensureTodoIds(
      [{ content: "a", status: "pending", priority: "high", id: "keep" }],
      [{ content: "a", status: "pending", priority: "high", id: "keep" }],
    );
    expect(result[0].id).toBe("keep");
    expect(result).toHaveLength(1);
  });

  it("matches by full tuple (content+status+priority) when no id", () => {
    const current = [
      { id: "a1", content: "Task", status: "pending" as const, priority: "high" as const },
      { id: "a2", content: "Task", status: "in_progress" as const, priority: "low" as const },
    ];
    const incoming = [
      { content: "Task", status: "in_progress" as const, priority: "low" as const },
      { content: "Task", status: "pending" as const, priority: "high" as const },
    ];
    const result = ensureTodoIds(incoming, current);
    // Reordered but should match by tuple, not index
    expect(result[0].id).toBe("a2");   // in_progress/low → "a2"
    expect(result[1].id).toBe("a1");   // pending/high → "a1"
  });

  it("rejects a list larger than the payload limit", () => {
    const result = validateTodoWrite(
      Array.from({ length: MAX_TODO_ITEMS + 1 }, (_, i) => sample({ content: `Task ${i}` })),
      [],
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(`at most ${MAX_TODO_ITEMS}`);
  });

  it("does not let an id-less item claim an ID explicitly preserved later in the payload", () => {
    const current = [
      { id: "task-a", content: "Task A", status: "pending" as const, priority: "high" as const },
    ];
    const incoming = [
      { content: "Task A", status: "pending" as const, priority: "high" as const },
      { id: "task-a", content: "Task C (diff)", status: "pending" as const, priority: "low" as const },
    ];

    const result = ensureTodoIds(incoming, current);

    expect(result[0].id).not.toBe("task-a");
    expect(result[1].id).toBe("task-a");
    expect(new Set(result.map((todo) => todo.id)).size).toBe(result.length);
  });

  it("generates fresh IDs for duplicate content items (ambiguous)", () => {
    const current = [
      { id: "a1", content: "Same", status: "pending" as const, priority: "high" as const },
      { id: "a2", content: "Same", status: "pending" as const, priority: "high" as const },
    ];
    const incoming = [
      { content: "Same", status: "completed" as const, priority: "high" as const },  // tuple doesn't match
    ];
    const result = ensureTodoIds(incoming, current);
    // Content is not unique in current → should get fresh UUID, not borrow
    expect(result[0].id).not.toBe("a1");
    expect(result[0].id).not.toBe("a2");
  });

  it("content-only fallback only when content is unique in current", () => {
    const current = [
      { id: "uniq", content: "Unique task", status: "pending" as const, priority: "medium" as const },
      { id: "other", content: "Other", status: "completed" as const, priority: "low" as const },
    ];
    const incoming = [
      { content: "Unique task", status: "completed" as const, priority: "medium" as const },  // status changed
    ];
    const result = ensureTodoIds(incoming, current);
    // Tuple doesn't match (different status) but content is unique → fallback borrows "uniq"
    expect(result[0].id).toBe("uniq");
  });
});

describe("getTodoIntegrityIssues", () => {
  it("reports missing and duplicate stable IDs", () => {
    expect(getTodoIntegrityIssues([
      sample({ id: "dup" }),
      sample({ id: "dup", content: "Other" }),
      sample({ content: "Legacy" }),
    ])).toEqual([
      'todos[1].id "dup" is duplicated',
      "todos[2] has no stable ID",
    ]);
  });
});
