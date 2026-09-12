import { describe, expect, it } from "vitest";
import { coercePriority, coerceStatus, prepareTodoUpdateArgs, prepareTodoWriteArgs } from "../src/coerce.js";
import { TODO_PRIORITIES, TODO_STATUSES } from "../src/types.js";
import { validateTodoWrite } from "../src/validate.js";

/** Structural check that a prepared payload can satisfy the tool schema. */
function matchesWriteSchema(value: unknown): boolean {
  const record = value as { todos?: unknown };
  if (!Array.isArray(record?.todos)) return false;
  return record.todos.every((item) => {
    const todo = item as Record<string, unknown>;
    if (typeof todo.content !== "string") return false;
    if (!(TODO_STATUSES as readonly string[]).includes(todo.status as string)) return false;
    if (todo.priority === undefined) return true;
    return (TODO_PRIORITIES as readonly string[]).includes(todo.priority as string);
  });
}

describe("coerceStatus / coercePriority", () => {
  it("maps the aliases models actually emit", () => {
    expect(coerceStatus("done")).toBe("completed");
    expect(coerceStatus("Complete")).toBe("completed");
    expect(coerceStatus("in-progress")).toBe("in_progress");
    expect(coerceStatus("In Progress")).toBe("in_progress");
    expect(coerceStatus("wip")).toBe("in_progress");
    expect(coerceStatus("todo")).toBe("pending");
    expect(coerceStatus("not started")).toBe("pending");
    expect(coerceStatus("canceled")).toBe("cancelled");
    expect(coercePriority("P1")).toBe("high");
    expect(coercePriority("urgent")).toBe("high");
    expect(coercePriority("normal")).toBe("medium");
    expect(coercePriority("lowest")).toBe("low");
  });

  it("leaves already-valid and unknown values untouched", () => {
    expect(coerceStatus("pending")).toBe("pending");
    expect(coerceStatus("banana")).toBe("banana");
    expect(coerceStatus(42)).toBe(42);
    expect(coercePriority(undefined)).toBe(undefined);
  });
});

describe("prepareTodoWriteArgs", () => {
  it("turns a near-miss payload into one the schema accepts", () => {
    const prepared = prepareTodoWriteArgs({
      todos: [
        { text: "Build the thing", status: "doing", priority: "P0" },
        { title: "Write docs", status: "todo" },
      ],
    });
    expect(matchesWriteSchema(prepared)).toBe(true);
    expect(prepared).toEqual({
      todos: [
        { content: "Build the thing", status: "in_progress", priority: "high" },
        { content: "Write docs", status: "pending" },
      ],
    });
  });

  it("parses a JSON string argument", () => {
    const prepared = prepareTodoWriteArgs(
      JSON.stringify({ todos: [{ content: "A", status: "done", priority: "low" }] }),
    );
    expect(prepared).toEqual({ todos: [{ content: "A", status: "completed", priority: "low" }] });
  });

  it("wraps a single todo object and accepts a bare array", () => {
    expect(prepareTodoWriteArgs({ todos: { content: "A", status: "pending" } })).toEqual({
      todos: [{ content: "A", status: "pending" }],
    });
    expect(prepareTodoWriteArgs([{ content: "A", status: "pending" }])).toEqual({
      todos: [{ content: "A", status: "pending" }],
    });
  });

  it("accepts the list under a plausible alias", () => {
    expect(prepareTodoWriteArgs({ items: [{ content: "A", status: "pending" }] })).toEqual({
      todos: [{ content: "A", status: "pending" }],
    });
  });

  it("drops a null id or priority instead of failing validation on it", () => {
    const prepared = prepareTodoWriteArgs({
      todos: [{ content: "A", status: "pending", id: null, priority: null }],
    }) as { todos: Array<Record<string, unknown>> };
    expect("id" in prepared.todos[0]).toBe(false);
    expect("priority" in prepared.todos[0]).toBe(false);
  });

  it("feeds validation successfully end to end", () => {
    const prepared = prepareTodoWriteArgs({
      todos: [{ task: "Ship it", status: "WIP", priority: "critical" }],
    }) as { todos: unknown[] };
    const result = validateTodoWrite(prepared.todos, []);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.todos[0]).toMatchObject({
        content: "Ship it",
        status: "in_progress",
        priority: "high",
      });
    }
  });

  it("passes hopeless input through for the schema to reject properly", () => {
    expect(prepareTodoWriteArgs("not json at all")).toBe("not json at all");
    expect(prepareTodoWriteArgs(null)).toBe(null);
    expect(prepareTodoWriteArgs({ nothing: true })).toEqual({ nothing: true });
  });
});

describe("prepareTodoUpdateArgs", () => {
  it("normalizes aliases and status values", () => {
    const prepared = prepareTodoUpdateArgs({ updates: [{ todo_id: "t1", status: "done" }] });
    expect(prepared).toEqual({ updates: [{ id: "t1", status: "completed" }] });
  });

  it("wraps a bare single patch", () => {
    expect(prepareTodoUpdateArgs({ id: "t2", status: "in-progress" })).toEqual({
      updates: [{ id: "t2", status: "in_progress" }],
    });
  });

  it("accepts a single object or a JSON string for updates", () => {
    expect(prepareTodoUpdateArgs({ updates: { id: "t1", priority: "p0" } })).toEqual({
      updates: [{ id: "t1", priority: "high" }],
    });
    expect(prepareTodoUpdateArgs('{"updates":[{"id":"t1","status":"skipped"}]}')).toEqual({
      updates: [{ id: "t1", status: "cancelled" }],
    });
  });

  it("does not invent an updates array out of nothing", () => {
    expect(prepareTodoUpdateArgs({ nothing: true })).toEqual({ nothing: true });
  });
});
