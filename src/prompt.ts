export const TODOWRITE_DESCRIPTION = `Create and maintain a structured task list for the current coding session. Tracks progress, organizes multi-step work, and surfaces status in an overlay above the editor.

## When to Use This Tool

Use this tool **proactively** — call todowrite **before** starting the work in these scenarios:

- Complex multi-step tasks — when work needs 3+ distinct steps
- Non-trivial work that benefits from planning (implement, refactor, debug, audit)
- **Explain / explore / review a codebase or feature** across multiple files or modules — break the walkthrough into todos first
- User provides multiple tasks (numbered or comma-separated) or asks for a todo list
- After receiving new instructions — capture requirements as todos before coding or explaining
- When you start a task — mark it \`in_progress\` (exactly ONE) BEFORE beginning work
- When you finish a task — mark it \`completed\` immediately (same turn you finish), then advance the next pending item to \`in_progress\`
- When the user says work is done / approved / finished — update the matching item to \`completed\` via todowrite before continuing

## When NOT to Use This Tool

Skip when:
- There is only a single, straightforward step (one file glance, one short answer)
- A one-line factual question with no multi-step plan
- Tracking truly adds no organizational value

Do **not** skip just because the request is "explain" or "review" — if the answer needs multiple steps or sections, use todowrite.

## States

- \`pending\` — not started
- \`in_progress\` — actively working (exactly ONE at a time; the tool rejects >1)
- \`completed\` — finished successfully
- \`cancelled\` — no longer needed

## Rules

- Each call **REPLACES** the entire list (full replace). Always pass the complete todos array.
- Update status in real time; don't batch completions across multiple finished steps.
- Mark \`completed\` only after the work is actually done (including verification) — never on intent alone.
- Keep exactly one \`in_progress\` while actively working. Never leave a stale \`in_progress\` after that step is finished.
- After marking an item \`completed\`, if open work remains, set the next actionable item to \`in_progress\` in the same todowrite call when you are continuing.
- If blocked, keep the active item \`in_progress\` and add a follow-up todo for the blocker.
- Items should be specific and actionable.
- Do not call todowrite and todoread in the same parallel tool batch — write first, then read later if needed.
- Prefer the live overlay for status; use todoread only when you need the JSON snapshot.`;

export const TODOREAD_DESCRIPTION =
  "Read the current session todo list. Returns JSON of all todos with status and priority. Prefer the overlay for at-a-glance status; call after todowrite settles (not in the same parallel batch).";

export const TODOWRITE_GUIDELINES = [
  "For multi-step work (3+ steps), codebase explain/explore/review, or when the user gives a list of tasks, call todowrite BEFORE starting — do not skip tracking.",
  "Pass the full list every todowrite call (full replace). Keep exactly one todo in_progress; mark completed immediately when a step finishes — never leave a stale in_progress.",
  "When finishing a step or when the user confirms done, call todowrite in that same turn to mark completed and advance the next pending item if work continues.",
  "Do not invent TaskCreate/TaskUpdate tools — use todowrite/todoread only.",
  "Do not call todowrite and todoread in the same parallel tool batch.",
];

/**
 * Appended to the system prompt on every agent start (pi-todotools pattern).
 * Fixes cold-start: tool description alone is easy for models to ignore.
 * Keep short — token cost every turn.
 */
export const TASK_MANAGEMENT_SECTION = `
<Task_Management>
todowrite/todoread are the coordination layer for multi-step work. The TUI overlay only appears after todowrite — without it the user cannot see plan/progress.

Required cold start: for explain/explore/review/implement/refactor/audit/debug/fix/polish/setup of a codebase, feature, UI, or multi-file ask — your FIRST tool call must be todowrite with a short checklist (WHAT/WHERE), exactly one in_progress, then continue. Do not start with read/bash/search alone on those asks.

Ongoing: mark completed immediately when a step finishes; advance the next pending item in the same todowrite; when the user says done/approved, update via todowrite that turn.

Skip only single trivial Q&A (one short fact, greeting). Multi-step Vietnamese or English asks (giải thích, chỉnh, bổ sung, help me, …) still need todos first.
</Task_Management>
`;

/** Extra systemPrompt boost when prompt-intent detects multi-step + empty list. */
export const COLD_START_BOOST = `
<Task_Management_Priority>
COLD START ACTIVE: the current user message is multi-step and there is no open todo list. Call todowrite before any other tool. Prefer 3–8 concrete checklist items. Keep exactly one in_progress.
</Task_Management_Priority>
`;
