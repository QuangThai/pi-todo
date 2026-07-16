import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { TODODIAGNOSE_DESCRIPTION } from "../prompt.js";
import { replayFromBranch } from "../replay.js";
import { TodoDiagnoseParams } from "../schema.js";
import { getTodos, withStoreLock } from "../store.js";
import type { TodoItem } from "../types.js";
import { TOOL_DIAGNOSE } from "../types.js";
import { getTodoIntegrityIssues, todosEqual } from "../validate.js";

interface TodoDiagnoseDetails {
  status: "consistent" | "mismatch" | "repair_needed";
  storeTodos: TodoItem[];
  replayedTodos: TodoItem[];
  integrityIssues: string[];
}

/** Registers a read-only comparison between live state and durable branch replay. */
export function registerTodoDiagnoseTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: TOOL_DIAGNOSE,
    label: "Todo Diagnose",
    description: TODODIAGNOSE_DESCRIPTION,
    promptSnippet: "Diagnose todo persistence without changing todos",
    parameters: TodoDiagnoseParams,

    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      return withStoreLock(() => {
        const storeTodos = getTodos();
        const replayedTodos = replayFromBranch(ctx);
          const integrityIssues = [
            ...getTodoIntegrityIssues(storeTodos).map((issue) => `current: ${issue}`),
            ...getTodoIntegrityIssues(replayedTodos).map((issue) => `durable: ${issue}`),
          ];
          const status = integrityIssues.length > 0
            ? "repair_needed"
            : todosEqual(storeTodos, replayedTodos) ? "consistent" : "mismatch";
          const details: TodoDiagnoseDetails = { status, storeTodos, replayedTodos, integrityIssues };
          const text =
            status === "consistent"
              ? "Persistence check: consistent — current todo snapshot matches durable branch replay."
              : status === "repair_needed"
                ? "Integrity check: REPAIR NEEDED — duplicate or missing IDs were found. Use todo_write with the complete list and omit ID for each affected item; no state was changed."
              : "Persistence check: MISMATCH — current todo snapshot differs from durable branch replay. No state was changed.";

        return {
          content: [{ type: "text", text: `${text}\n\n${JSON.stringify(details, null, 2)}` }],
          details,
        };
      });
    },

    renderCall(_args, theme) {
      return new Text(theme.fg("toolTitle", theme.bold("todo_diagnose")), 0, 0);
    },

    renderResult(result, _opts, theme) {
      const details = result.details as TodoDiagnoseDetails | undefined;
        const text = details?.status === "consistent" ? "✓ Consistent" : details?.status === "repair_needed" ? "! Repair needed" : "! Mismatch";
      const color = details?.status === "consistent" ? "success" : "warning";
      return new Text(theme.fg(color, text), 0, 0);
    },
  });
}
