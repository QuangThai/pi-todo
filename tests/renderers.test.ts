import type { Component } from "@earendil-works/pi-tui";
import { beforeEach, describe, expect, it } from "vitest";
import { registerTodoCommands } from "../src/commands/todos.js";
import { __resetStore, setTodos } from "../src/store.js";
import { registerTodoReadTool } from "../src/tools/todoread.js";
import { registerTodoUpdateTool } from "../src/tools/todoupdate.js";
import { registerTodoWriteTool } from "../src/tools/todowrite.js";
import type { TodoItem, TodoWriteDetails } from "../src/types.js";

/**
 * Renderers are the part of a tool pi calls without the model in the loop, and
 * the part unit tests usually skip. The previous revision had unreachable
 * branches in todo_write's renderResult precisely because nothing exercised it.
 */

type Renderer = {
  renderCall?: (args: Record<string, unknown>, theme: unknown, ctx: unknown) => Component;
  renderResult?: (result: unknown, options: unknown, theme: unknown, ctx: unknown) => Component;
};

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
  italic: (text: string) => text,
  strikethrough: (text: string) => `~${text}~`,
} as never;

function captureTools() {
  const tools = new Map<string, Renderer>();
  const pi = {
    registerTool: (definition: { name: string } & Renderer) => tools.set(definition.name, definition),
    registerCommand: () => {},
    registerFlag: () => {},
    appendEntry: () => {},
  } as never;
  registerTodoWriteTool(pi, {});
  registerTodoUpdateTool(pi, {});
  registerTodoReadTool(pi);
  return tools;
}

const render = (component: Component, width = 80): string => component.render(width).join("\n");

const todo = (content: string, status: TodoItem["status"], id: string): TodoItem => ({
  id,
  content,
  status,
  priority: "high",
});

const result = (details: TodoWriteDetails, text = "body") => ({
  content: [{ type: "text", text }],
  details,
});

beforeEach(() => __resetStore());

describe("tool renderers", () => {
  it("renders the todo_write call with its item count", () => {
    const tools = captureTools();
    const component = tools.get("todo_write")!.renderCall!({ todos: [{}, {}, {}] }, theme, {});
    expect(render(component)).toContain("3 item(s)");
  });

  it("renders a todo_write success with open/total counts", () => {
    const tools = captureTools();
    const component = tools.get("todo_write")!.renderResult!(
      result({ todos: [todo("a", "in_progress", "t1"), todo("b", "completed", "t2")] }),
      {},
      theme,
      {},
    );
    const text = render(component);
    expect(text).toContain("Saved");
    expect(text).toContain("1 open / 2 total");
  });

  it("renders a todo_write error instead of a success line", () => {
    const tools = captureTools();
    const component = tools.get("todo_write")!.renderResult!(
      result({ todos: [], error: "exactly one in_progress allowed" }),
      {},
      theme,
      {},
    );
    const text = render(component);
    expect(text).toContain("Error: exactly one in_progress allowed");
    expect(text).not.toContain("Saved");
  });

  it("renders a todo_write no-op distinctly", () => {
    const tools = captureTools();
    const component = tools.get("todo_write")!.renderResult!(
      result({ todos: [todo("a", "pending", "t1")], unchanged: true }),
      {},
      theme,
      {},
    );
    expect(render(component)).toContain("No change");
  });

  it("renders todo_update call, success, error and no-op", () => {
    const tools = captureTools();
    const update = tools.get("todo_update")!;
    expect(render(update.renderCall!({ updates: [{}, {}] }, theme, {}))).toContain("2 patch(es)");
    expect(
      render(update.renderResult!(result({ todos: [todo("a", "pending", "t1")] }), {}, theme, {})),
    ).toContain("1 open / 1 total");
    expect(render(update.renderResult!(result({ todos: [], error: "bad id" }), {}, theme, {}))).toContain(
      "Error: bad id",
    );
    expect(render(update.renderResult!(result({ todos: [], unchanged: true }), {}, theme, {}))).toContain(
      "No change",
    );
  });

  it("renders todo_read call and both result states", () => {
    const tools = captureTools();
    const read = tools.get("todo_read")!;
    expect(render(read.renderCall!({}, theme, {}))).toContain("todo_read");
    expect(render(read.renderResult!({ content: [], details: { todos: [] } }, {}, theme, {}))).toContain(
      "0 items",
    );
    expect(
      render(
        read.renderResult!(
          { content: [], details: { todos: [todo("a", "pending", "t1"), todo("b", "completed", "t2")] } },
          {},
          theme,
          {},
        ),
      ),
    ).toContain("1 open / 2 total");
  });

  it("falls back gracefully when details are missing", () => {
    const tools = captureTools();
    const component = tools.get("todo_write")!.renderResult!(
      { content: [], details: undefined },
      {},
      theme,
      {},
    );
    expect(render(component)).toContain("0 open / 0 total");
  });
});

describe("/todos list component", () => {
  function buildComponent(todos: TodoItem[]): Component {
    let captured: Component | undefined;
    const commands = new Map<string, { handler: (args: string, ctx: unknown) => Promise<void> }>();
    const pi = {
      registerCommand: (name: string, options: { handler: (args: string, ctx: unknown) => Promise<void> }) =>
        commands.set(name, options),
      appendEntry: () => {},
    } as never;
    registerTodoCommands(pi, {
      onCommit: () => {},
      areNudgesEnabled: () => true,
      setNudgesEnabled: () => {},
    });
    setTodos(todos);
    const ctx = {
      mode: "tui",
      hasUI: true,
      ui: {
        notify: () => {},
        async custom(factory: (tui: unknown, t: unknown, kb: unknown, done: () => void) => Component) {
          captured = factory({}, theme, {}, () => {});
          return undefined;
        },
      },
    };
    void commands.get("todos")!.handler("", ctx);
    if (!captured) throw new Error("component was not created");
    return captured;
  }

  it("lists finished items that the overlay hides, with counts", () => {
    const component = buildComponent([
      todo("finished", "completed", "t1"),
      todo("running", "in_progress", "t2"),
      todo("waiting", "pending", "t3"),
    ]);
    const text = render(component);
    expect(text).toContain("2 open");
    expect(text).toContain("1 running");
    expect(text).toContain("1 done");
    expect(text).toContain("finished");
    expect(text).toContain("running");
    expect(text).toContain("Escape to close");
  });

  it("caches by width and clears that cache on invalidate", () => {
    const component = buildComponent([todo("a", "pending", "t1")]);
    const first = component.render(80);
    expect(component.render(80)).toBe(first);
    component.invalidate();
    expect(component.render(80)).not.toBe(first);
    expect(component.render(80).join("\n")).toBe(first.join("\n"));
  });

  it("says so when there is nothing to show", () => {
    expect(render(buildComponent([]))).toContain("No todos in this session yet.");
  });
});
