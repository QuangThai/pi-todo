import { describe, expect, it, beforeEach } from "vitest";
import { replayFromBranch } from "../src/replay.js";
import { getTodos, setTodos, __resetStore } from "../src/store.js";
import { validateTodoWrite } from "../src/validate.js";
import { TODO_STATE_ENTRY_TYPE, TOOL_WRITE } from "../src/types.js";

/**
 * Build a fake branch entry for a todo_write tool result.
 */
function toolResultEntry(
  todos: Array<{ content: string; status: string; priority: string }>,
) {
  return {
    type: "message",
    message: {
      role: "toolResult",
      toolName: TOOL_WRITE,
      details: { todos },
    },
  };
}

/**
 * Build a fake branch entry for a custom pi-todo.state entry.
 */
function customStateEntry(
  todos: Array<{ content: string; status: string; priority: string }>,
) {
  return {
    type: "custom",
    customType: TODO_STATE_ENTRY_TYPE,
    data: { todos },
  };
}

function branch(entries: unknown[]) {
  return {
    sessionManager: {
      getBranch: () => entries,
    },
  };
}

beforeEach(() => {
  __resetStore();
});

describe("persistence roundtrip accuracy", () => {
  it("write → replayFromBranch returns latest written state", () => {
    // Simulate: todo_write called with list A
    const todosA = [
      { content: "Task A", status: "pending", priority: "high" },
    ];
    const rA = validateTodoWrite(todosA, getTodos());
    expect(rA.ok).toBe(true);
    if (rA.ok) setTodos(rA.todos);

    // Simulate: todo_write called with list B (full replace)
    const todosB = [
      { content: "Task A", status: "completed", priority: "high" },
      { content: "Task B", status: "in_progress", priority: "medium" },
    ];
    const rB = validateTodoWrite(todosB, getTodos());
    expect(rB.ok).toBe(true);
    if (rB.ok) setTodos(rB.todos);

    // Now simulate session restart: replay from branch with both entries.
    // Branch is chronological (root→leaf), so the later entry wins.
    const entries = [
      toolResultEntry(todosA),
      toolResultEntry(todosB),
    ];
    const replayed = replayFromBranch(branch(entries));
    expect(replayed).toHaveLength(2);
    expect(replayed[0].content).toBe("Task A");
    expect(replayed[0].status).toBe("completed");
    expect(replayed[1].content).toBe("Task B");
    expect(replayed[1].status).toBe("in_progress");
  });

  it("custom entry overrides earlier toolResult entry", () => {
    const entries = [
      toolResultEntry([
        { content: "Stale", status: "pending", priority: "low" },
      ]),
      customStateEntry([
        { content: "Fresh", status: "in_progress", priority: "high" },
      ]),
    ];
    const replayed = replayFromBranch(branch(entries));
    expect(replayed).toHaveLength(1);
    expect(replayed[0].content).toBe("Fresh");
  });

  it("last custom entry wins when multiple custom entries exist", () => {
    const entries = [
      customStateEntry([
        { content: "Old state", status: "pending", priority: "medium" },
      ]),
      customStateEntry([
        { content: "New state", status: "in_progress", priority: "high" },
      ]),
    ];
    const replayed = replayFromBranch(branch(entries));
    expect(replayed).toHaveLength(1);
    expect(replayed[0].content).toBe("New state");
  });

  it("ignore non-todo entries (irrelevant branch entries)", () => {
    const entries = [
      {
        type: "message",
        message: { role: "user", content: "hello" },
      },
      {
        type: "message",
        message: {
          role: "toolResult",
          toolName: "some_other_tool",
          details: { result: "ok" },
        },
      },
      toolResultEntry([
        { content: "Only todo", status: "in_progress", priority: "high" },
      ]),
    ];
    const replayed = replayFromBranch(branch(entries));
    expect(replayed).toHaveLength(1);
    expect(replayed[0].content).toBe("Only todo");
  });

  it("error envelope does not overwrite good state", () => {
    const entries = [
      toolResultEntry([
        { content: "Good", status: "in_progress", priority: "high" },
      ]),
      {
        type: "message",
        message: {
          role: "toolResult",
          toolName: TOOL_WRITE,
          details: {
            todos: [{ content: "Bad", status: "pending", priority: "low" }],
            error: "something went wrong",
          },
        },
      },
    ];
    const replayed = replayFromBranch(branch(entries));
    // Error envelope should be skipped → good state persists
    expect(replayed).toHaveLength(1);
    expect(replayed[0].content).toBe("Good");
  });

  it("empty branch results in empty state", () => {
    expect(replayFromBranch(branch([]))).toEqual([]);
  });

  it("write→read→write→read cycle reflects latest state", () => {
    // Write 1: initial list
    const write1 = [
      { content: "Step 1", status: "in_progress", priority: "high" },
    ];
    const r1 = validateTodoWrite(write1, getTodos());
    expect(r1.ok).toBe(true);
    if (r1.ok) setTodos(r1.todos);
    expect(getTodos()).toHaveLength(1);
    expect(getTodos()[0].content).toBe("Step 1");

    // Write 2: add completed, advance
    const write2 = [
      { content: "Step 1", status: "completed", priority: "high" },
      { content: "Step 2", status: "in_progress", priority: "medium" },
    ];
    const r2 = validateTodoWrite(write2, getTodos());
    expect(r2.ok).toBe(true);
    if (r2.ok) setTodos(r2.todos);
    expect(getTodos()).toHaveLength(2);
    expect(getTodos()[0].status).toBe("completed");
    expect(getTodos()[1].status).toBe("in_progress");

    // Write 3: clear all
    const write3: Array<{ content: string; status: string; priority: string }> = [];
    const r3 = validateTodoWrite(write3, getTodos());
    expect(r3.ok).toBe(true);
    if (r3.ok) setTodos(r3.todos);
    expect(getTodos()).toHaveLength(0);

    // Replay from branch with all 3 writes → should reflect latest (empty)
    const entries = [
      toolResultEntry(write1),
      toolResultEntry(write2),
      toolResultEntry(write3),
    ];
    const replayed = replayFromBranch(branch(entries));
    expect(replayed).toHaveLength(0);
  });
});

describe("persistence with custom entries (todowrite's pi.appendEntry)", () => {
  it("todo_write with unchanged flag does not append custom entry", () => {
    const initial = [
      { content: "Task", status: "pending" as const, priority: "medium" as const },
    ];
    setTodos(initial);

    const branchWithEntry = [customStateEntry(initial)];

    const replayed = replayFromBranch(branch(branchWithEntry));
    expect(replayed).toHaveLength(1);
    expect(replayed[0].content).toBe("Task");
  });

  it("custom entry + toolResult (todowrite double-write)", () => {
    const todos = [
      { content: "Stable", status: "in_progress", priority: "high" },
    ];

    const entries = [
      customStateEntry(todos),
      toolResultEntry(todos),
    ];
    expect(replayFromBranch(branch(entries))).toEqual([
      { content: "Stable", status: "in_progress", priority: "high" },
    ]);

    const entriesRev = [
      toolResultEntry(todos),
      customStateEntry(todos),
    ];
    expect(replayFromBranch(branch(entriesRev))).toEqual([
      { content: "Stable", status: "in_progress", priority: "high" },
    ]);
  });
});
