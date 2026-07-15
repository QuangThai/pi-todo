import { describe, expect, it, beforeEach } from "vitest";
import { ensureTodoIds, validateTodoUpdate } from "../src/validate.js";
import { registerTodoUpdateTool } from "../src/tools/todoupdate.js";
import { getTodos, setTodos, __resetStore } from "../src/store.js";
import type { TodoItem } from "../src/types.js";

/** Mock pi for atomicity tests */
function createMockPi(appendEntryImpl: () => void) {
  let registeredHandler: { execute: Function } | null = null;
  const registerTool = (opts: Record<string, unknown>) => {
    registeredHandler = { execute: opts.execute as Function };
  };
  return {
    pi: { appendEntry: appendEntryImpl, registerTool } as Record<string, unknown>,
    async execute(params: Record<string, unknown>) {
      if (!registeredHandler) throw new Error("Handler not registered");
      return registeredHandler.execute("tool_1", params) as Promise<unknown>;
    },
  };
}

beforeEach(() => __resetStore());

/** Helper: write a list of raw items (no IDs) and return the items with assigned IDs from store. */
function seedStore(
  raw: Array<{ content: string; status: string; priority: string }>,
): TodoItem[] {
  const seeded = ensureTodoIds(raw.map((r) => ({ ...r } as TodoItem)), []);
  setTodos(seeded);
  return getTodos();
}

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

describe("todo_update atomicity (appendEntry failure)", () => {
  it("returns error and keeps store unchanged on stale-ctx", async () => {
    const mock = createMockPi(() => {
      throw new Error("stale after session replacement: session 2");
    });
    registerTodoUpdateTool(mock.pi as never, { onCommit: () => {} });

    const existing = seedStore([
      { content: "Safe", status: "in_progress", priority: "high" },
    ]);

    const result = await mock.execute({
      updates: [{ id: existing[0].id!, status: "completed" }],
    }) as any;

    expect(result.details.error).toBeDefined();
    expect(String(result.details.error)).toContain("stale");
    expect(getTodos()).toEqual(existing);
  });

  it("propagates real persistence errors", async () => {
    const mock = createMockPi(() => {
      throw new Error("disk full: cannot write entry");
    });
    registerTodoUpdateTool(mock.pi as never, { onCommit: () => {} });

    const existing = seedStore([
      { content: "Safe", status: "in_progress", priority: "medium" },
    ]);

    await expect(
      mock.execute({ updates: [{ id: existing[0].id!, priority: "low" }] }),
    ).rejects.toThrow("disk full");

    expect(getTodos()).toEqual(existing);
  });

  it("succeeds and updates store when appendEntry succeeds", async () => {
    const mock = createMockPi(() => {});
    registerTodoUpdateTool(mock.pi as never, { onCommit: () => {} });

    const existing = seedStore([
      { content: "Old", status: "in_progress", priority: "high" },
    ]);

    const result = await mock.execute({
      updates: [{ id: existing[0].id!, status: "completed" }],
    }) as any;

    expect(result.details.error).toBeUndefined();
    const stored = getTodos();
    expect(stored[0].status).toBe("completed");
    expect(stored[0].id).toBe(existing[0].id);
  });
});
