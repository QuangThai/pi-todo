import { describe, expect, it } from "vitest";
import { sanitizeTodoText } from "../src/sanitize.js";
import { validateTodoWrite, hasOpenTodos, todosEqual } from "../src/validate.js";
import type { TodoItem } from "../src/types.js";

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
