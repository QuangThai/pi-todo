import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { formatTodoListText } from "../format.js";
import { TODOREAD_DESCRIPTION } from "../prompt.js";
import { TodoReadParams } from "../schema.js";
import { getTodos, withStoreLock } from "../store.js";
import { TOOL_READ } from "../types.js";
import { countOpenTodos } from "../validate.js";

export function registerTodoReadTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: TOOL_READ,
    label: "Todo Read",
    description: TODOREAD_DESCRIPTION,
    promptSnippet: "Read the current session todo list",
    parameters: TodoReadParams,

    async execute() {
      return withStoreLock(() => {
        const todos = getTodos();
        const open = countOpenTodos(todos);
        const text =
          todos.length === 0
            ? "No todos"
            : formatTodoListText(todos, `${open} open / ${todos.length} total`);

        return {
          content: [
            {
              type: "text",
              text: `${text}\n\n${JSON.stringify(todos, null, 2)}`,
            },
          ],
          details: { todos },
        };
      });
    },

    renderCall(_args, theme) {
      return new Text(theme.fg("toolTitle", theme.bold("todo_read")), 0, 0);
    },

    renderResult(result, _opts, theme) {
      const details = result.details as { todos?: unknown[] } | undefined;
      const todos = details?.todos;
      if (!Array.isArray(todos) || todos.length === 0) {
        return new Text(theme.fg("dim", "0 items"), 0, 0);
      }
      const total = todos.length;
      const open = Array.isArray(todos) ? todos.filter((t: any) => t.status === "pending" || t.status === "in_progress").length : 0;
      return new Text(theme.fg("muted", `${open} open / ${total} total`), 0, 0);
    },
  });
}
