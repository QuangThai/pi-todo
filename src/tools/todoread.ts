import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { DEFAULT_MAX_BYTES, formatSize, truncateHead } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { formatTodoListText } from "../format.js";
import { TODOREAD_DESCRIPTION } from "../prompt.js";
import { TodoReadParams } from "../schema.js";
import { getTodos, withStoreLock } from "../store.js";
import type { TodoReadDetails } from "../types.js";
import { MAX_RESULT_LINES, TOOL_READ } from "../types.js";
import { countOpenTodos } from "../validate.js";

export function registerTodoReadTool(pi: ExtensionAPI): void {
  pi.registerTool<typeof TodoReadParams, TodoReadDetails>({
    name: TOOL_READ,
    label: "Todo Read",
    description: TODOREAD_DESCRIPTION,
    promptSnippet: "Read the current session todo list",
    parameters: TodoReadParams,
    // Reads take the same store lock, so they never observe a half-applied write.

    async execute() {
      return withStoreLock(() => {
        const todos = getTodos();
        const open = countOpenTodos(todos);
        // One representation only. The previous version emitted the checklist and
        // then a pretty-printed JSON copy of the same data: double the tokens for
        // the same facts, and unbounded (200 items x 500 chars overran pi's 50KB
        // tool-output limit). Structured data still reaches the UI via `details`.
        const listing =
          todos.length === 0
            ? "No todos"
            : formatTodoListText(todos, `${open} open / ${todos.length} total`, { showPriority: true });

        const truncation = truncateHead(listing, {
          maxLines: MAX_RESULT_LINES + 2,
          maxBytes: DEFAULT_MAX_BYTES,
        });
        const text = truncation.truncated
          ? `${truncation.content}\n[Output truncated: ${truncation.outputLines} of ${truncation.totalLines} lines, ${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}.]`
          : truncation.content;

        return { content: [{ type: "text", text }], details: { todos } };
      });
    },

    renderCall(_args, theme) {
      return new Text(theme.fg("toolTitle", theme.bold("todo_read")), 0, 0);
    },

    renderResult(result, _opts, theme) {
      const todos = result.details?.todos ?? [];
      if (todos.length === 0) {
        return new Text(theme.fg("dim", "0 items"), 0, 0);
      }
      const open = countOpenTodos(todos);
      return new Text(theme.fg("muted", `${open} open / ${todos.length} total`), 0, 0);
    },
  });
}
