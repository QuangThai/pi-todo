import { describe, expect, it, beforeEach } from "vitest";
import { __resetStore, getTodos, setTodos, withStoreLock } from "../src/store.js";

beforeEach(() => {
  __resetStore();
});

describe("withStoreLock", () => {
  it("serializes concurrent readers/writers so the later op sees prior commits", async () => {
    const order: string[] = [];

    const write = withStoreLock(async () => {
      order.push("write-start");
      await Promise.resolve();
      setTodos([{ content: "from-write", status: "pending", priority: "medium" }]);
      order.push("write-end");
      return "written";
    });

    const read = withStoreLock(async () => {
      order.push("read-start");
      const todos = getTodos();
      order.push("read-end");
      return todos;
    });

    const [writeResult, readResult] = await Promise.all([write, read]);

    expect(writeResult).toBe("written");
    expect(readResult).toEqual([
      { content: "from-write", status: "pending", priority: "medium" },
    ]);
    expect(order).toEqual(["write-start", "write-end", "read-start", "read-end"]);
  });
});
