import { describe, expect, it, beforeEach } from "vitest";
import { registerTodoWriteTool } from "../src/tools/todowrite.js";
import { getTodos, setTodos, __resetStore } from "../src/store.js";

/**
 * Build a minimal mock pi that captures the registered tool handler
 * and exposes a controllable appendEntry that can throw synchronously.
 */
function createMockPi(appendEntryImpl: () => void = () => {}) {
  let registeredHandler: { execute: Function } | null = null;
  let appendEntryCalled = false;

  const registerTool = (opts: {
    name: string;
    label: string;
    description: string;
    parameters: unknown;
    execute: Function;
  }) => {
    registeredHandler = { execute: opts.execute };
  };

  const appendEntry = () => {
    appendEntryCalled = true;
    appendEntryImpl();
  };

  return {
    pi: { appendEntry, registerTool } as Record<string, unknown>,
    appendEntryCalled: () => appendEntryCalled,
    registeredHandler,
    /** Helper: call the captured execute handler */
    async execute(params: Record<string, unknown>) {
      if (!registeredHandler) throw new Error("Handler not registered");
      return registeredHandler.execute("tool_1", params) as Promise<unknown>;
    },
  };
}

beforeEach(() => {
  __resetStore();
});

describe("todo_write atomicity (appendEntry failure)", () => {
  it("returns error and keeps store unchanged when appendEntry throws stale-ctx", async () => {
    const mock = createMockPi(() => {
      throw new Error("stale after session replacement: session 2");
    });
    registerTodoWriteTool(mock.pi as never, { onCommit: () => {} });

    // Set initial store state
    setTodos([
      { content: "Keep me", status: "in_progress" as const, priority: "high" as const },
    ]);

    // Attempt write
    const result = await mock.execute({
      todos: [{ content: "New thing", status: "pending", priority: "low" }],
    }) as any;

    // Should have returned an error
    expect(result.details.error).toBeDefined();
    expect(String(result.details.error)).toContain("stale");

    // Store must NOT have changed
    const stored = getTodos();
    expect(stored).toHaveLength(1);
    expect(stored[0].content).toBe("Keep me");
  });

  it("propagates real persistence/disk errors (they throw)", async () => {
    const mock = createMockPi(() => {
      throw new Error("disk full: cannot write entry");
    });
    registerTodoWriteTool(mock.pi as never, { onCommit: () => {} });

    setTodos([
      { content: "Safe", status: "in_progress" as const, priority: "medium" as const },
    ]);

    // The real error should propagate (rethrow)
    await expect(
      mock.execute({
        todos: [{ content: "Risk", status: "pending", priority: "low" }],
      }),
    ).rejects.toThrow("disk full");

    // Store unchanged
    const stored = getTodos();
    expect(stored).toHaveLength(1);
    expect(stored[0].content).toBe("Safe");
  });

  it("succeeds and updates store when appendEntry succeeds", async () => {
    const mock = createMockPi(); // no throw
    registerTodoWriteTool(mock.pi as never, { onCommit: () => {} });

    setTodos([
      { content: "Old", status: "in_progress" as const, priority: "high" as const },
    ]);

    const result = await mock.execute({
      todos: [{ content: "New", status: "pending", priority: "low" }],
    }) as any;

    // Should succeed
    expect(result.details.error).toBeUndefined();
    const stored = getTodos();
    expect(stored).toHaveLength(1);
    expect(stored[0].content).toBe("New");
  });

  it("no-op (unchanged) skips appendEntry entirely", async () => {
    const mock = createMockPi(() => {
      throw new Error("should not be called");
    });
    registerTodoWriteTool(mock.pi as never, { onCommit: () => {} });

    const existing = [
      { content: "Stable", status: "in_progress" as const, priority: "medium" as const },
    ];
    setTodos(existing);

    // Write identical content
    const result = await mock.execute({ todos: existing }) as any;

    expect(result.details.unchanged).toBe(true);
    const stored = getTodos();
    expect(stored).toHaveLength(1);
    expect(stored[0].content).toBe("Stable");
  });
});
