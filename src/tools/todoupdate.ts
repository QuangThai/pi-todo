import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { prepareTodoUpdateArgs } from "../coerce.js";
import { formatTodoListText } from "../format.js";
import { TODOUPDATE_DESCRIPTION } from "../prompt.js";
import { type TodoUpdateInput, TodoUpdateParams } from "../schema.js";
import { getTodos, setTodos, withStoreLock } from "../store.js";
import type { TodoWriteDetails } from "../types.js";
import { TOOL_UPDATE } from "../types.js";
import { countOpenTodos, ensureTodoIds, validateTodoUpdate } from "../validate.js";
import { errorResult, persistTodoState } from "./persist.js";

export function registerTodoUpdateTool(pi: ExtensionAPI, options: { onCommit?: () => void }): void {
  pi.registerTool<typeof TodoUpdateParams, TodoWriteDetails>({
    name: TOOL_UPDATE,
    label: "Todo Update",
    description: TODOUPDATE_DESCRIPTION,
    promptSnippet: "Patch one or more existing todos by ID without replacing the full list",
    parameters: TodoUpdateParams,
    // See todo_write: mutual exclusion comes from withStoreLock, not from
    // serializing the batch.
    prepareArguments: (args) => prepareTodoUpdateArgs(args) as TodoUpdateInput,

    async execute(_toolCallId, params) {
      return withStoreLock(() => {
        const current = getTodos();
        const result = validateTodoUpdate(params.updates, current);
        if (!result.ok) return errorResult(current, result.error);

        const todos = ensureTodoIds(result.todos, current);
        if (!result.unchanged) {
          const failure = persistTodoState(pi, todos, TOOL_UPDATE);
          if (failure) return errorResult(current, failure.error, failure.message);
        }

        setTodos(todos);
        options.onCommit?.();

        const open = countOpenTodos(todos);
        const text = result.unchanged
          ? "No change"
          : `Updated ${params.updates.length} todo(s)\n\n${formatTodoListText(todos, `${open} open / ${todos.length} total`)}`;

        const details: TodoWriteDetails = { todos, ...(result.unchanged ? { unchanged: true } : {}) };
        return { content: [{ type: "text", text }], details };
      });
    },

    renderCall(args, theme) {
      const n = Array.isArray(args.updates) ? args.updates.length : 0;
      return new Text(
        theme.fg("toolTitle", theme.bold("todo_update ")) + theme.fg("accent", `${n} patch(es)`),
        0,
        0,
      );
    },

    renderResult(result, _opts, theme) {
      const details = result.details;
      if (details?.error) return new Text(theme.fg("error", `Error: ${details.error}`), 0, 0);
      if (details?.unchanged) return new Text(theme.fg("dim", "No change"), 0, 0);
      const todos = details?.todos ?? [];
      const open = countOpenTodos(todos);
      return new Text(
        theme.fg("success", "✓ Saved") + theme.fg("muted", ` · ${open} open / ${todos.length} total`),
        0,
        0,
      );
    },
  });
}
