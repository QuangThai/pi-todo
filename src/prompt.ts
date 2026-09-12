/**
 * Prompt text for the todo tools.
 *
 * Two rules govern everything in this file.
 *
 * 1. One source of truth per rule. Every string here is sent on every request,
 *    so a rule restated in the description, the guidelines, and the schema costs
 *    three times its tokens and drifts out of sync. The tool `description` owns
 *    the full rules; `promptGuidelines` carries only the few lines that must sit
 *    in the always-on Guidelines section; the schema describes fields, not policy.
 *
 * 2. Nothing here is conditional. pi renders `tools` -> `system` -> `messages`,
 *    and the provider caches that prefix, so a system prompt that changes shape
 *    between user turns invalidates the cached history every time it flips.
 *    Per-turn, situational text belongs in a tail message injected from the
 *    `context` event (see prompt-intent.ts), never in the system prompt.
 */

export const TODOWRITE_DESCRIPTION = `Create and maintain the session task list. Progress is shown in a live overlay above the editor.

Use it when the work has 3+ distinct steps, spans multiple files, or the user supplies a list of tasks. Skip it for a single step or a one-line answer.

Status values: pending | in_progress | completed | cancelled. Keep exactly one item in_progress — the call is rejected when more than one is.

Each call REPLACES the entire list, so always send every item. Array order is the workflow timeline: keep existing positions as statuses change, and add or reorder only deliberately.

IDs: omit \`id\` for a new item and a short one (t1, t2, …) is assigned. Supply an \`id\` only to keep an item that already exists, copied exactly from the current list or from todo_read; never invent one. An unknown \`id\` is recovered as a new item instead of failing the call, so do not retry the same payload after a recovery.

Mark an item completed only once the work is really done, and set the next item in_progress in the same call.`;

export const TODOUPDATE_DESCRIPTION = `Patch existing todos by stable id (t1, t2, …) without replacing the list or changing its order. Every id must match a current todo exactly: copy it from the last todo_write/todo_update output or from todo_read, and never invent or approximate one. This tool cannot delete items — use todo_write for that.`;

export const TODOREAD_DESCRIPTION = `Return the current session todo list with its stable ids. The overlay already shows status, so call this only when you need the exact ids.`;

/**
 * Appended to the default system prompt's Guidelines section while the tools are
 * active. Each bullet names its tool, because pi appends them flat with no tool
 * prefix and "this tool" would be ambiguous.
 */
export const TODOWRITE_GUIDELINES = [
  "Use todo_write to plan and track work with 3+ steps or spanning several files; skip it for single-step requests.",
  "Keep exactly one todo in_progress, and mark it completed with todo_write or todo_update as soon as that step finishes — never leave a stale in_progress behind.",
  "todo_write replaces the whole list, so send every item and omit id for new ones; use todo_update to patch an existing item by its exact id.",
];

export const TODOS_COMMAND_DESCRIPTION = "Show the session todo list, or reset it / toggle reminders";
export const DIAGNOSE_COMMAND_DESCRIPTION =
  "Compare the live todo snapshot with the durable session replay (read-only)";
