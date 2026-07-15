import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { formatTodoListText } from "../format.js";
import { TODOWRITE_DESCRIPTION, TODOWRITE_GUIDELINES } from "../prompt.js";
import { TodoWriteParams } from "../schema.js";
import { getTodos, setTodos, withStoreLock } from "../store.js";
import type { TodoWriteDetails } from "../types.js";
import { TODO_STATE_ENTRY_TYPE, TOOL_WRITE } from "../types.js";
import { countOpenTodos, ensureTodoIds, todosEqual, validateTodoWrite } from "../validate.js";

export function registerTodoWriteTool(
  pi: ExtensionAPI,
  options: { onCommit?: () => void },
): void {
  pi.registerTool({
    name: TOOL_WRITE,
    label: "Todo Write",
    description: TODOWRITE_DESCRIPTION,
    promptSnippet: "Replace the session todo list (full replace); track multi-step work",
    promptGuidelines: TODOWRITE_GUIDELINES,
    parameters: TodoWriteParams,

    async execute(_toolCallId, params) {
      return withStoreLock(() => {
        const current = getTodos();
        const result = validateTodoWrite(params.todos, current);

        if (!result.ok) {
          const details: TodoWriteDetails = { todos: current, error: result.error };
          return {
            content: [{ type: "text", text: `Error: ${result.error}` }],
            details,
          };
        }

          const todos = result.unchanged ? result.todos : ensureTodoIds(result.todos, current);
          const unchanged = result.unchanged || todosEqual(todos, current);
          // 1. Persist durable state BEFORE updating in-memory store.
        //    If appendEntry fails (stale ctx, persistence error), we abort
        //    so in-memory store never diverges from durable state.
          if (!unchanged) {
          try {
              pi.appendEntry(TODO_STATE_ENTRY_TYPE, { todos });
          } catch (e) {
            // Stale session: discard this write entirely — returning error
            // so the LLM knows the state was not committed.
            if (/stale after session replacement/i.test(String(e))) {
              return {
                content: [
                  {
                    type: "text",
                    text: "Error: session was replaced — state not committed. Please retry todo_write.",
                  },
                ],
                details: { todos: current, error: "stale session replacement" } satisfies TodoWriteDetails,
              };
            }
            // Real persistence/disk/runtime error: propagate.
            throw e;
          }
        }

        // 2. Durable write succeeded (or no-op) — now update in-memory store.
          setTodos(todos);

        options.onCommit?.();

          const open = countOpenTodos(todos);
          const summary = unchanged
          ? "No change"
            : `${open} open / ${todos.length} total`;
        const body =
            todos.length === 0 ? "Cleared todos" : formatTodoListText(todos, summary);

        const details: TodoWriteDetails = {
            todos,
            ...(unchanged ? { unchanged: true } : {}),
        };

        return {
          content: [{ type: "text", text: body }],
          details,
        };
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
      const details = result.details as TodoWriteDetails | undefined;
      if (details?.error) {
        return new Text(theme.fg("error", `Error: ${details.error}`), 0, 0);
      }
      if (details?.unchanged) {
        return new Text(theme.fg("dim", "No change"), 0, 0);
      }
      const text = result.content[0];
      if (!details?.error && !details?.unchanged) {
        const open = details?.todos ? details.todos.filter((t: any) => t.status === "pending" || t.status === "in_progress").length : 0;
        const total = details?.todos?.length ?? 0;
          return new Text(
            theme.fg("success", "✓ Saved") + theme.fg("muted", ` · ${open} open / ${total} total`),
            0,
            0,
          );
      }
      const msg = text?.type === "text" ? text.text.split("\n")[0] ?? "Updated" : "Updated";
      return new Text(theme.fg("success", "✓ ") + theme.fg("muted", msg), 0, 0);
    },
  });
}
