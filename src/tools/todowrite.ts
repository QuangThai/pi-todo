import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { prepareTodoWriteArgs } from "../coerce.js";
import { formatTodoListText } from "../format.js";
import { TODOWRITE_DESCRIPTION, TODOWRITE_GUIDELINES } from "../prompt.js";
import { type TodoWriteInput, TodoWriteParams } from "../schema.js";
import { getTodos, setTodos, withStoreLock } from "../store.js";
import type { TodoWriteDetails } from "../types.js";
import { TOOL_WRITE } from "../types.js";
import { countOpenTodos, ensureTodoIds, todosEqual, validateTodoWrite } from "../validate.js";
import { errorResult, persistTodoState } from "./persist.js";

export function registerTodoWriteTool(pi: ExtensionAPI, options: { onCommit?: () => void }): void {
  pi.registerTool<typeof TodoWriteParams, TodoWriteDetails>({
    name: TOOL_WRITE,
    label: "Todo Write",
    description: TODOWRITE_DESCRIPTION,
    promptSnippet: "Replace the session todo list (full replace); track multi-step work",
    promptGuidelines: TODOWRITE_GUIDELINES,
    parameters: TodoWriteParams,
    // No executionMode override: withStoreLock already gives every mutation
    // mutual exclusion, and the todo tools touch no files, so forcing the whole
    // batch sequential would only slow down unrelated sibling tools.
    prepareArguments: (args) => prepareTodoWriteArgs(args) as TodoWriteInput,

    async execute(_toolCallId, params) {
      return withStoreLock(() => {
        const current = getTodos();
        const result = validateTodoWrite(params.todos, current);

        if (!result.ok) return errorResult(current, result.error);

        const recoveredIds = result.recoveredIds ?? [];
        const todos = result.unchanged ? result.todos : ensureTodoIds(result.todos, current);
        const unchanged = result.unchanged || todosEqual(todos, current);

        if (!unchanged) {
          const failure = persistTodoState(pi, todos, TOOL_WRITE);
          if (failure) return errorResult(current, failure.error, failure.message);
        }

        // Durable write succeeded (or was a no-op) — only now update memory.
        setTodos(todos);
        options.onCommit?.();

        const open = countOpenTodos(todos);
        const summary = unchanged ? "No change" : `${open} open / ${todos.length} total`;
        const recoveryNote =
          recoveredIds.length > 0
            ? `Recovered stale ID(s) as new items: ${recoveredIds.join(", ")}.\n\n`
            : "";
        const body =
          todos.length === 0
            ? `${recoveryNote}Cleared todos`
            : `${recoveryNote}${formatTodoListText(todos, summary)}`;

        const details: TodoWriteDetails = {
          todos,
          ...(recoveredIds.length > 0
            ? { warnings: [`Recovered stale ID(s) as new items: ${recoveredIds.join(", ")}`] }
            : {}),
          ...(unchanged ? { unchanged: true } : {}),
        };

        return { content: [{ type: "text", text: body }], details };
      });
    },

    renderCall(args, theme) {
      const n = Array.isArray(args.todos) ? args.todos.length : 0;
      return new Text(
        theme.fg("toolTitle", theme.bold("todo_write ")) + theme.fg("accent", `${n} item(s)`),
        0,
        0,
      );
    },

    renderResult(result, _opts, theme) {
      const details = result.details;
      if (details?.error) {
        return new Text(theme.fg("error", `Error: ${details.error}`), 0, 0);
      }
      if (details?.unchanged) {
        return new Text(theme.fg("dim", "No change"), 0, 0);
      }
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
