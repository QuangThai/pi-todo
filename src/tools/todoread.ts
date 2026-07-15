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
      return new Text(theme.fg("toolTitle", theme.bold("todoread")), 0, 0);
    },

    renderResult(result, _opts, theme) {
      const details = result.details as { todos?: unknown[] } | undefined;
      const n = Array.isArray(details?.todos) ? details.todos.length : 0;
      return new Text(theme.fg("muted", `${n} todo(s)`), 0, 0);
    },
  });
}
