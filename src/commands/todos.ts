import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";
import { matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import { diagnoseTodos, formatDiagnosis } from "../diagnose.js";
import { formatPlainTodoLine, getTodoMarker } from "../format.js";
import { DIAGNOSE_COMMAND_DESCRIPTION, TODOS_COMMAND_DESCRIPTION } from "../prompt.js";
import { replayFromBranch } from "../replay.js";
import { getTodos, setTodos, withStoreLock } from "../store.js";
import { persistTodoState } from "../tools/persist.js";
import type { TodoItem } from "../types.js";
import { COMMAND_DIAGNOSE, COMMAND_TODOS, TOOL_WRITE } from "../types.js";
import { countCompletedTodos, countOpenTodos, countRunningTodos } from "../validate.js";

export interface TodoCommandOptions {
  /** Refresh the overlay after a user-initiated mutation. */
  onCommit: () => void;
  areNudgesEnabled: () => boolean;
  setNudgesEnabled: (enabled: boolean) => void;
}

/** Full list, including finished items — the overlay deliberately hides those. */
class TodoListComponent {
  private cachedWidth: number | undefined;
  private cachedLines: string[] | undefined;

  constructor(
    private readonly todos: readonly TodoItem[],
    private readonly theme: Theme,
    private readonly onClose: () => void,
  ) {}

  handleInput(data: string): void {
    if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) this.onClose();
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;
    const th = this.theme;
    const lines: string[] = [""];
    lines.push(
      truncateToWidth(` ${th.fg("accent", th.bold("Todos"))} ${th.fg("muted", this.counts())}`, width),
    );
    lines.push("");
    if (this.todos.length === 0) {
      lines.push(truncateToWidth(`  ${th.fg("dim", "No todos in this session yet.")}`, width));
    } else {
      for (const todo of this.todos) {
        lines.push(truncateToWidth(`  ${this.renderRow(todo)}`, width));
      }
    }
    lines.push("");
    lines.push(truncateToWidth(`  ${th.fg("dim", "Escape to close")}`, width));
    lines.push("");
    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  /** Drop cached rendering state. This is what `invalidate` is for. */
  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  private counts(): string {
    return `${countOpenTodos(this.todos)} open · ${countRunningTodos(this.todos)} running · ${countCompletedTodos(this.todos)} done`;
  }

  private renderRow(todo: TodoItem): string {
    const th = this.theme;
    const marker = getTodoMarker(todo.status);
    const id = th.fg("accent", (todo.id ?? "--").padEnd(3));
    const priority = th.fg("dim", `(${todo.priority})`);
    if (todo.status === "in_progress") {
      return `${th.fg("warning", marker)} ${id} ${th.fg("warning", todo.content)} ${priority}`;
    }
    if (todo.status === "completed" || todo.status === "cancelled") {
      return `${th.fg("dim", marker)} ${id} ${th.fg("dim", th.strikethrough(todo.content))} ${priority}`;
    }
    return `${th.fg("muted", marker)} ${id} ${th.fg("muted", todo.content)} ${priority}`;
  }
}

async function showList(ctx: ExtensionCommandContext, todos: readonly TodoItem[]): Promise<void> {
  if (ctx.mode === "tui") {
    await ctx.ui.custom<void>(
      (_tui, theme, _keybindings, done) => new TodoListComponent(todos, theme, () => done()),
    );
    return;
  }
  // Hosts without terminal rendering still get the content, just not the dialog.
  const body =
    todos.length === 0
      ? "No todos in this session yet."
      : todos.map((todo) => formatPlainTodoLine(todo, { showPriority: true })).join("\n");
  ctx.ui.notify(body, "info");
}

async function resetTodos(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  options: TodoCommandOptions,
): Promise<void> {
  const current = getTodos();
  if (current.length === 0) {
    ctx.ui.notify("Todo list is already empty.", "info");
    return;
  }
  if (ctx.hasUI) {
    const confirmed = await ctx.ui.confirm(
      "Reset todos?",
      `Discard all ${current.length} todo(s) for this session.`,
    );
    if (!confirmed) return;
  }
  const failure = await withStoreLock(() => {
    const persistFailure = persistTodoState(pi, [], TOOL_WRITE);
    if (persistFailure) return persistFailure;
    setTodos([]);
    return undefined;
  });
  if (failure) {
    ctx.ui.notify(`Could not reset todos: ${failure.message}`, "error");
    return;
  }
  options.onCommit();
  ctx.ui.notify("Todo list cleared.", "info");
}

function toggleNudges(ctx: ExtensionContext, options: TodoCommandOptions, arg: string): void {
  const wanted = arg === "on" ? true : arg === "off" ? false : undefined;
  if (wanted === undefined) {
    ctx.ui.notify(
      `Todo reminders are ${options.areNudgesEnabled() ? "on" : "off"}. Use "/todos reminders on" or "/todos reminders off".`,
      "info",
    );
    return;
  }
  options.setNudgesEnabled(wanted);
  ctx.ui.notify(`Todo reminders ${wanted ? "on" : "off"}.`, "info");
}

/**
 * User-facing surfaces. These are commands rather than tools on purpose: the
 * model never needs to inspect persistence or reset the list, and a tool would
 * spend description and schema tokens on every request to offer it that.
 */
export function registerTodoCommands(pi: ExtensionAPI, options: TodoCommandOptions): void {
  pi.registerCommand(COMMAND_TODOS, {
    description: TODOS_COMMAND_DESCRIPTION,
    getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
      const items: AutocompleteItem[] = [
        { value: "reset", label: "reset", description: "Discard every todo in this session" },
        { value: "reminders on", label: "reminders on", description: "Enable idle/cold-start reminders" },
        { value: "reminders off", label: "reminders off", description: "Disable idle/cold-start reminders" },
      ];
      const matches = items.filter((item) => item.value.startsWith(prefix));
      return matches.length > 0 ? matches : null;
    },
    handler: async (args, ctx) => {
      const argument = args.trim().toLowerCase();
      if (argument === "reset") {
        await resetTodos(pi, ctx, options);
        return;
      }
      if (argument.startsWith("reminders")) {
        toggleNudges(ctx, options, argument.slice("reminders".length).trim());
        return;
      }
      await showList(ctx, getTodos());
    },
  });

  pi.registerCommand(COMMAND_DIAGNOSE, {
    description: DIAGNOSE_COMMAND_DESCRIPTION,
    handler: async (_args, ctx) => {
      const diagnosis = diagnoseTodos(getTodos(), replayFromBranch(ctx));
      const report = formatDiagnosis(diagnosis);
      if (ctx.mode === "tui") {
        await ctx.ui.custom<void>((_tui, theme, _keybindings, done) => {
          const lines = report.map((line) => (line === "" ? "" : `  ${theme.fg("muted", line)}`));
          const component = {
            render: (width: number) =>
              ["", ...lines, "", `  ${theme.fg("dim", "Escape to close")}`, ""].map((l) =>
                truncateToWidth(l, width),
              ),
            invalidate: () => {},
            handleInput: (data: string) => {
              if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) done();
            },
          };
          return component;
        });
        return;
      }
      ctx.ui.notify(report.join("\n"), diagnosis.status === "consistent" ? "info" : "warning");
    },
  });
}

export { TodoListComponent };
