import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { formatTodoListText } from "../format.js";
import { TODOWRITE_DESCRIPTION, TODOWRITE_GUIDELINES } from "../prompt.js";
import { TodoWriteParams } from "../schema.js";
import { getTodos, setTodos, withStoreLock } from "../store.js";
import type { TodoWriteDetails } from "../types.js";
import { TODO_STATE_ENTRY_TYPE, TOOL_WRITE } from "../types.js";
import { countOpenTodos, validateTodoWrite } from "../validate.js";

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

        setTodos(result.todos);

        // Durable custom entry (not sent to LLM) — survives compaction better than tool details alone.
        // Skip no-op rewrites to avoid session noise.
        if (!result.unchanged) {
          try {
            pi.appendEntry(TODO_STATE_ENTRY_TYPE, { todos: result.todos });
          } catch (e) {
            // Only swallow host-reject errors (stale context, unsupported custom entry).
            // Let real runtime/disk/persistence errors propagate so they surface to the user.
            if (/stale after session replacement/i.test(String(e))) {
              // Expected: session was replaced, this append is discarded.
              // toolResult details still provide branch replay.
            } else {
              throw e;
            }
          }
        }

        options.onCommit?.();

        const open = countOpenTodos(result.todos);
        const summary = result.unchanged
          ? "No change"
          : `${open} open / ${result.todos.length} total`;
        const body =
          result.todos.length === 0 ? "Cleared todos" : formatTodoListText(result.todos, summary);

        const details: TodoWriteDetails = {
          todos: result.todos,
          ...(result.unchanged ? { unchanged: true } : {}),
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
        return new Text(theme.fg("success", "✓ ") + theme.fg("muted", `${open} open / ${total} total`), 0, 0);
      }
      const msg = text?.type === "text" ? text.text.split("\n")[0] ?? "Updated" : "Updated";
      return new Text(theme.fg("success", "✓ ") + theme.fg("muted", msg), 0, 0);
    },
  });
}
