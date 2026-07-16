import { beforeEach, describe, expect, it } from "vitest";
import { registerTodoDiagnoseTool } from "../src/tools/tododiagnose.js";
import { __resetStore, setTodos } from "../src/store.js";
import { TODO_STATE_ENTRY_TYPE } from "../src/types.js";

function createMockPi() {
  let execute: ((...args: unknown[]) => Promise<unknown>) | undefined;
  return {
    pi: {
      registerTool: (definition: { execute: (...args: unknown[]) => Promise<unknown> }) => {
        execute = definition.execute;
      },
    },
    execute: async (entries: unknown[]) => {
      if (!execute) throw new Error("diagnostic tool was not registered");
      return execute("call_1", {}, undefined, undefined, {
        sessionManager: { getBranch: () => entries },
      });
    },
  };
}

beforeEach(() => __resetStore());

describe("todo_diagnose", () => {
  it("reports consistent when store matches durable replay", async () => {
    const todos = [{ id: "task", content: "Task", status: "in_progress" as const, priority: "high" as const }];
    setTodos(todos);
    const mock = createMockPi();
    registerTodoDiagnoseTool(mock.pi as never);

    const result = await mock.execute([
      { type: "custom", customType: TODO_STATE_ENTRY_TYPE, data: { todos } },
    ]) as { details: { status: string } };

    expect(result.details.status).toBe("consistent");
  });

  it("reports mismatch without modifying either snapshot", async () => {
    setTodos([{ id: "live", content: "Live", status: "pending" as const, priority: "low" as const }]);
    const mock = createMockPi();
    registerTodoDiagnoseTool(mock.pi as never);

    const result = await mock.execute([
      {
        type: "custom",
        customType: TODO_STATE_ENTRY_TYPE,
          data: { todos: [{ id: "durable", content: "Durable", status: "completed", priority: "high" }] },
      },
    ]) as { details: { status: string; storeTodos: Array<{ content: string }> } };

    expect(result.details.status).toBe("mismatch");
    expect(result.details.storeTodos[0].content).toBe("Live");
  });

  it("reports repair_needed when matching snapshots contain duplicate IDs", async () => {
    const todos = [
      { id: "dup", content: "One", status: "pending" as const, priority: "low" as const },
      { id: "dup", content: "Two", status: "completed" as const, priority: "high" as const },
    ];
    setTodos(todos);
    const mock = createMockPi();
    registerTodoDiagnoseTool(mock.pi as never);

    const result = await mock.execute([
      { type: "custom", customType: TODO_STATE_ENTRY_TYPE, data: { todos } },
    ]) as { details: { status: string; integrityIssues: string[] } };

    expect(result.details.status).toBe("repair_needed");
    expect(result.details.integrityIssues).toContain('current: todos[1].id "dup" is duplicated');
  });
});
