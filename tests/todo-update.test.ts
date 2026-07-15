import { describe, expect, it } from "vitest";
import { ensureTodoIds, validateTodoUpdate } from "../src/validate.js";

describe("todo_update validation", () => {
  const current = ensureTodoIds([
    { content: "One", status: "in_progress", priority: "high" },
    { content: "Two", status: "pending", priority: "low" },
  ], []);

  it("patches only the identified todo and preserves IDs", () => {
    const result = validateTodoUpdate([{ id: current[0].id, status: "completed" }], current);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.todos[0].id).toBe(current[0].id);
      expect(result.todos[0].status).toBe("completed");
      expect(result.todos[1]).toEqual(current[1]);
    }
  });

  it("rejects unknown and duplicate IDs", () => {
    expect(validateTodoUpdate([{ id: "missing", status: "completed" }], current).ok).toBe(false);
    expect(validateTodoUpdate([{ id: current[0].id, status: "completed" }, { id: current[0].id, priority: "low" }], current).ok).toBe(false);
  });
});
