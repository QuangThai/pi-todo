export const TODOWRITE_DESCRIPTION = `Create and maintain a structured task list for the current coding session. Tracks progress, organizes multi-step work, and surfaces status in an overlay above the editor.

## When to Use This Tool

Use this tool **proactively** — call todo_write **before** starting the work in these scenarios:

- Complex multi-step tasks — when work needs 3+ distinct steps
- Non-trivial work that benefits from planning (implement, refactor, debug, audit)
- **Explain / explore / review a codebase or feature** across multiple files or modules — break the walkthrough into todos first
- User provides multiple tasks (numbered or comma-separated) or asks for a todo list
- After receiving new instructions — capture requirements as todos before coding or explaining
- When you start a task — mark it \`in_progress\` (exactly ONE) BEFORE beginning work
- When you finish a task — mark it \`completed\` immediately (same turn you finish), then advance the next pending item to \`in_progress\`
- When the user says work is done / approved / finished — update the matching item to \`completed\` via todo_write before continuing

## When NOT to Use This Tool

Skip when:
- There is only a single, straightforward step (one file glance, one short answer)
- A one-line factual question with no multi-step plan
- Tracking truly adds no organizational value

Do **not** skip just because the request is "explain" or "review" — if the answer needs multiple steps or sections, use todo_write.

## States

- \`pending\` — not started
- \`in_progress\` — actively working (exactly ONE at a time; the tool rejects >1)
- \`completed\` — finished successfully
- \`cancelled\` — no longer needed

## Rules

- Each call **REPLACES** the entire list (full replace). Always pass the complete todos array.
  - **ID rule:** omit \`id\` for every new item — the system assigns it. Only preserve an \`id\` returned by \`todo_read\` for an item that already exists; never invent an ID. For changed, repeated, or long/truncated content, preserve the exact existing ID instead of relying on content matching. Full replacement does not inherently reset IDs: matching existing items can retain them.
  - Do not call \`todo_write\` and a dependent \`todo_update\` in the same parallel batch. Complete the write, then use its returned IDs (or \`todo_read\`) for the update.
- Update status in real time; don't batch completions across multiple finished steps.
- Mark \`completed\` only after the work is actually done (including verification) — never on intent alone.
- Keep exactly one \`in_progress\` while actively working. Never leave a stale \`in_progress\` after that step is finished.
- When using \`todo_write\`, after marking an item \`completed\`, set the next actionable item to \`in_progress\` in the same full-replace call when you are continuing.
- Array order is the workflow timeline. Preserve existing item positions as statuses change; add or reorder items only deliberately.
- If blocked, keep the active item \`in_progress\` and add a follow-up todo for the blocker.
- Items should be specific and actionable.
- Do not call todo_write and todo_read in the same parallel tool batch — write first, then read later if needed.
- Prefer the live overlay for status; use todo_read only when you need the JSON snapshot.`;

export const TODOREAD_DESCRIPTION =
  "Read the current session todo list. Returns JSON of all todos with status, priority, and stable IDs. Prefer the overlay for at-a-glance status; call after todo_write settles (not in the same parallel batch). A legacy item without an ID cannot be patched by todo_update; rewrite it with todo_write and omit id to assign one.";

export const TODODIAGNOSE_DESCRIPTION =
  "Read-only persistence diagnostic. Compares the current in-memory todo snapshot with the durable session-branch replay. Use only to investigate suspected reload, tree-navigation, or compaction state drift; it never changes todos.";

export const TODOWRITE_GUIDELINES = [
  "For multi-step work (3+ steps), codebase explain/explore/review, or when the user gives a list of tasks, call todo_write BEFORE starting — do not skip tracking.",
  "Pass the full list every todo_write call (full replace). Keep exactly one todo in_progress; mark completed immediately when a step finishes — never leave a stale in_progress.",
  "ID rule: for todo_write, omit id for new items so the system assigns one. Supply an id only to preserve an existing item, using the exact ID from todo_read; never invent IDs. For changed, repeated, or long/truncated content, preserve that exact ID rather than relying on content matching. For todo_update, id is required and must match a current todo.",
  "Never call todo_write and a todo_update that depends on its IDs in the same parallel batch. Wait for todo_write to finish, then use its returned IDs or call todo_read. If todo_read shows a legacy item without id, rewrite it with todo_write and omit id to assign one before using todo_update.",
  "When finishing a step or when the user confirms done, use todo_update for an ID-based patch when possible; use todo_write only when replacing the full checklist. Advance the next pending item in the same mutation if work continues.",
  "Treat todo array order as the workflow timeline: preserve positions when updating statuses, and only add or reorder items intentionally.",
  "Use todo_write for full replacement and todo_update for ID-based patches; todo_read exposes IDs and todo_diagnose is read-only troubleshooting.",
  "Do not call todo_write and todo_read in the same parallel tool batch.",
];

/**
 * Appended to the system prompt on every agent start (pi-todotools pattern).
 * Fixes cold-start: tool description alone is easy for models to ignore.
 * Keep short — token cost every turn.
 */
export const TASK_MANAGEMENT_SECTION = `
<Task_Management>
todo_write/todo_update/todo_read are the coordination layer for multi-step work. Use todo_write for the initial/full checklist and todo_update for a targeted patch by stable ID. In todo_write, omit id for new items; only retain an exact ID returned by todo_read for an existing item. In todo_update, id is required and must match a current todo. Do not call a write and an update that depends on its IDs in the same parallel batch: wait for the write result first. The TUI overlay only appears after a todo mutation — without it the user cannot see plan/progress.

Required cold start: for explain/explore/review/implement/refactor/audit/debug/fix/polish/setup of a codebase, feature, UI, or multi-file ask — your FIRST tool call must be todo_write with a short checklist (WHAT/WHERE), exactly one in_progress, then continue. Do not start with read/bash/search alone on those asks.

Ongoing: mark completed immediately when a step finishes; use todo_update for a targeted ID-based patch or todo_write for a full replacement. Advance the next pending item in the same mutation; when the user says done/approved, update that turn.

Skip only single trivial Q&A (one short fact, greeting). Multi-step Vietnamese or English asks (giải thích, chỉnh, bổ sung, help me, …) still need todos first.
</Task_Management>
`;

/** Extra systemPrompt boost when prompt-intent detects multi-step + empty list. */
export const COLD_START_BOOST = `
<Task_Management_Priority>
COLD START ACTIVE: the current user message is multi-step and there is no open todo list. Call todo_write before any other tool. Prefer 3–8 concrete checklist items. Keep exactly one in_progress.
</Task_Management_Priority>
`;
