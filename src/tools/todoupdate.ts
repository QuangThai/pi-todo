import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { TodoUpdateParams } from "../schema.js";
import { getTodos, setTodos, withStoreLock } from "../store.js";
import type { TodoWriteDetails } from "../types.js";
import { TODO_STATE_ENTRY_TYPE, TOOL_UPDATE } from "../types.js";
import { ensureTodoIds, validateTodoUpdate } from "../validate.js";

export function registerTodoUpdateTool(pi: ExtensionAPI, options: { onCommit?: () => void }): void {
  pi.registerTool({
    name: TOOL_UPDATE,
    label: "Todo Update",
    description: "Patch existing todos by stable ID. Use todo_read first to obtain IDs. This never deletes items.",
    promptSnippet: "Patch one or more existing todos by ID without replacing the full list",
    parameters: TodoUpdateParams,
    async execute(_toolCallId, params) {
      return withStoreLock(() => {
        const current = getTodos();
        const result = validateTodoUpdate(params.updates, current);
        if (!result.ok) return { content: [{ type: "text", text: `Error: ${result.error}` }], details: { todos: current, error: result.error } as TodoWriteDetails };
        const todos = ensureTodoIds(result.todos, current);
        if (!result.unchanged) {
          try { pi.appendEntry(TODO_STATE_ENTRY_TYPE, { todos }); }
          catch (e) {
            if (/stale after session replacement/i.test(String(e))) {
              return { content: [{ type: "text", text: "Error: session was replaced — state not committed. Please retry todo_update." }], details: { todos: current, error: "stale session replacement" } as TodoWriteDetails };
            }
            throw e;
          }
        }
        setTodos(todos);
        options.onCommit?.();
        return { content: [{ type: "text", text: result.unchanged ? "No change" : `Updated ${params.updates.length} todo(s)` }], details: { todos, ...(result.unchanged ? { unchanged: true } : {}) } as TodoWriteDetails };
      });
    },
    renderCall(args, theme) { return new Text(theme.fg("toolTitle", theme.bold("todo_update ")) + theme.fg("accent", `${Array.isArray(args.updates) ? args.updates.length : 0} patch(es)`), 0, 0); },
    renderResult(result, _opts, theme) {
      const details = result.details as TodoWriteDetails | undefined;
      if (details?.error) return new Text(theme.fg("error", `Error: ${details.error}`), 0, 0);
      return new Text(theme.fg("success", details?.unchanged ? "No change" : "✓ Saved"), 0, 0);
    },
  });
}
