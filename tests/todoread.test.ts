import { beforeEach, describe, expect, it } from "vitest";
import { __resetStore, setTodos } from "../src/store.js";
import { registerTodoReadTool } from "../src/tools/todoread.js";
import type { TodoItem, TodoReadDetails } from "../src/types.js";
import { MAX_CONTENT_LENGTH, MAX_RESULT_LINES, MAX_TODO_ITEMS } from "../src/types.js";

type ToolResult = { content: Array<{ type: string; text: string }>; details: TodoReadDetails };

function captureRead() {
  let execute: ((id: string, params: Record<string, unknown>) => Promise<ToolResult>) | undefined;
  const pi = {
    registerTool: (definition: {
      execute: (id: string, params: Record<string, unknown>) => Promise<ToolResult>;
    }) => {
      execute = definition.execute;
    },
  } as never;
  registerTodoReadTool(pi);
  if (!execute) throw new Error("todo_read was not registered");
  return () => execute!("call_1", {});
}

const todo = (content: string, status: TodoItem["status"], id: string): TodoItem => ({
  id,
  content,
  status,
  priority: "low",
});

beforeEach(() => __resetStore());

describe("todo_read output", () => {
  it("reports an empty list plainly", async () => {
    const read = captureRead();
    const result = await read();
    expect(result.content[0].text).toBe("No todos");
    expect(result.details.todos).toEqual([]);
  });

  it("returns one representation, not a checklist plus a JSON copy", async () => {
    // The old version appended JSON.stringify(todos, null, 2) after the list:
    // twice the tokens for the same facts, and unbounded in size.
    setTodos([todo("wire overlay", "in_progress", "t1"), todo("write docs", "pending", "t2")]);
    const result = await captureRead()();
    const text = result.content[0].text;

    // "open" is pending + in_progress, so both of these count.
    expect(text).toContain("2 open / 2 total");
    expect(text).toContain("[•] t1 wire overlay (low)");
    expect(text).toContain("[ ] t2 write docs (low)");
    expect(text).not.toContain('"status"');
    expect(text).not.toContain("[\n");
    // Structured data still reaches renderers and replay through details.
    expect(result.details.todos).toHaveLength(2);
  });

  it("stays inside pi's tool-output budget at maximum list size", async () => {
    // 200 items x 500 characters is the worst case the schema permits. The old
    // pretty-printed JSON dump exceeded pi's documented 50KB / 2000-line limit.
    setTodos(
      Array.from({ length: MAX_TODO_ITEMS }, (_, i) =>
        todo("x".repeat(MAX_CONTENT_LENGTH), i === 0 ? "in_progress" : "pending", `t${i + 1}`),
      ),
    );
    const result = await captureRead()();
    const text = result.content[0].text;
    const lines = text.split("\n");

    expect(Buffer.byteLength(text, "utf8")).toBeLessThan(50 * 1024);
    expect(lines.length).toBeLessThan(2000);
    // Line cap keeps the echo small; the count line tells the model what is hidden.
    expect(lines.length).toBeLessThanOrEqual(MAX_RESULT_LINES + 2);
    expect(text).toContain(`and ${MAX_TODO_ITEMS - MAX_RESULT_LINES} more`);
    expect(result.details.todos).toHaveLength(MAX_TODO_ITEMS);
  });
});
