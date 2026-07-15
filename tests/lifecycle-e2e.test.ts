import { beforeEach, describe, expect, it } from "vitest";
import initExtension from "../src/index.js";
import { __resetStore, getTodos } from "../src/store.js";

type Handler = (...args: any[]) => unknown;

function createPiLifecycleHost() {
  const branch: unknown[] = [];
  const tools = new Map<string, { execute: Handler }>();
  const handlers = new Map<string, Handler[]>();
  const ctx = { hasUI: false, sessionManager: { getBranch: () => branch } };
  const pi = {
    registerTool: (tool: { name: string; execute: Handler }) => tools.set(tool.name, tool),
    appendEntry: (customType: string, data: unknown) => branch.push({ type: "custom", customType, data }),
    on: (event: string, handler: Handler) => {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
  };
  return {
    branch,
    tools,
    ctx,
    pi,
      async emit(event: string, payload: Record<string, unknown> = {}) {
        const results: unknown[] = [];
        for (const handler of handlers.get(event) ?? []) {
          results.push(await handler(payload, ctx));
        }
        return results;
    },
  };
}

beforeEach(() => __resetStore());

describe("extension lifecycle E2E", () => {
  it("keeps stable IDs and status through update, tree, compact, shutdown, and restart", async () => {
    const host = createPiLifecycleHost();
    initExtension(host.pi as never);
    await host.emit("session_start");

    const write = await host.tools.get("todo_write")!.execute("call-1", {
      todos: [
        { content: "Build", status: "in_progress", priority: "high" },
        { content: "Test", status: "pending", priority: "medium" },
      ],
    }) as { details: { todos: Array<{ id: string; status: string }> } };
    const buildId = write.details.todos[0].id;
    expect(buildId).toBeTruthy();

    await host.tools.get("todo_update")!.execute("call-2", {
      updates: [{ id: buildId, status: "completed" }, { id: write.details.todos[1].id, status: "in_progress" }],
    });
    await host.emit("session_tree");
    host.branch.push({ type: "compaction", summary: "test", firstKeptEntryId: "x", tokensBefore: 1 });
    await host.emit("session_compact");

      expect(getTodos().map((todo) => [todo.id, todo.status])).toEqual([
      [buildId, "completed"],
      [write.details.todos[1].id, "in_progress"],
    ]);
    await host.emit("session_shutdown");
    expect(getTodos()).toEqual([]);
    await host.emit("session_start");
    expect(getTodos().map((todo) => [todo.id, todo.status])).toEqual([
      [buildId, "completed"],
      [write.details.todos[1].id, "in_progress"],
      ]);
    });

    it("clears a completion nudge after a successful todo_update", async () => {
      const host = createPiLifecycleHost();
      initExtension(host.pi as never);
      await host.emit("session_start");

      const write = await host.tools.get("todo_write")!.execute("call-1", {
        todos: [{ content: "Finish", status: "in_progress", priority: "high" }],
      }) as { details: { todos: Array<{ id: string }> } };

      await host.emit("before_agent_start", { prompt: "done", systemPrompt: "system" });
      await host.tools.get("todo_update")!.execute("call-2", {
        updates: [{ id: write.details.todos[0].id, status: "completed" }],
      });
      await host.emit("tool_execution_end", { toolName: "todo_update", isError: false });

      const contextResults = await host.emit("context", { messages: [] });
      expect(contextResults).toEqual([undefined]);
    });
  });
