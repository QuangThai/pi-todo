import { describe, expect, it } from "vitest";
import { diagnoseTodos, formatDiagnosis, summarizeDiagnosis } from "../src/diagnose.js";
import { replayFromBranch } from "../src/replay.js";
import type { TodoItem } from "../src/types.js";
import { TODO_STATE_ENTRY_TYPE } from "../src/types.js";

const branchWith = (todos: TodoItem[]) => ({
  sessionManager: {
    getBranch: () => [{ type: "custom", customType: TODO_STATE_ENTRY_TYPE, data: { todos } }],
  },
});

describe("diagnoseTodos", () => {
  it("reports consistent when the live snapshot matches the durable replay", () => {
    const todos: TodoItem[] = [{ id: "t1", content: "Task", status: "in_progress", priority: "high" }];
    const diagnosis = diagnoseTodos(todos, replayFromBranch(branchWith(todos)));
    expect(diagnosis.status).toBe("consistent");
    expect(summarizeDiagnosis(diagnosis)).toMatch(/consistent/);
  });

  it("reports mismatch without modifying either snapshot", () => {
    const live: TodoItem[] = [{ id: "live", content: "Live", status: "pending", priority: "low" }];
    const durable: TodoItem[] = [
      { id: "durable", content: "Durable", status: "completed", priority: "high" },
    ];
    const diagnosis = diagnoseTodos(live, replayFromBranch(branchWith(durable)));

    expect(diagnosis.status).toBe("mismatch");
    expect(diagnosis.storeTodos[0].content).toBe("Live");
    expect(diagnosis.replayedTodos[0].content).toBe("Durable");
    // Snapshots are copied, so a caller cannot mutate the store through the report.
    diagnosis.storeTodos[0].content = "tampered";
    expect(live[0].content).toBe("Live");
  });

  it("reports repair_needed when matching snapshots contain duplicate IDs", () => {
    const todos: TodoItem[] = [
      { id: "dup", content: "One", status: "pending", priority: "low" },
      { id: "dup", content: "Two", status: "completed", priority: "high" },
    ];
    const diagnosis = diagnoseTodos(todos, replayFromBranch(branchWith(todos)));
    expect(diagnosis.status).toBe("repair_needed");
    expect(diagnosis.integrityIssues).toContain('current: todos[1].id "dup" is duplicated');
    expect(diagnosis.integrityIssues).toContain('durable: todos[1].id "dup" is duplicated');
  });

  it("renders a report with both snapshots and the issue list", () => {
    const todos: TodoItem[] = [{ content: "No ID", status: "pending", priority: "low" }];
    const report = formatDiagnosis(diagnoseTodos(todos, [])).join("\n");
    expect(report).toMatch(/REPAIR NEEDED/);
    expect(report).toMatch(/live \(1\)/);
    expect(report).toMatch(/durable \(0\)/);
    expect(report).toMatch(/\(empty\)/);
    expect(report).toMatch(/has no stable ID/);
  });
});
