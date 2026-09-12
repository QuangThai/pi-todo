# Changelog

## 0.7.0 (2026-09-12)

A repo-wide audit against pi's extension docs. Two user-visible bugs, one
significant cost regression, and the surfaces that were missing.

### Fixed

- **Ghost overlay.** The widget component treated `invalidate()` as "you were
  removed", but pi calls it from `ui.invalidate()` on every theme change to mean
  "drop cached rendering state". The registration flag then disagreed with pi's
  widget map, so the `setWidget(key, undefined)` that hides a finished checklist
  never fired and the overlay stayed pinned above the editor for the rest of the
  session. Registration state is now only changed next to the `setWidget` call
  that causes it, and the component also implements `dispose()`.
- **No overlay outside the TUI.** pi's RPC transport forwards only the
  string-array form of `setWidget` and silently drops component factories, so
  every non-TUI front end saw nothing. The same layout is now sent as plain
  lines when `ctx.mode !== "tui"`.
- **Prompt cache invalidation.** The system prompt was extended or not depending
  on how each user prompt classified. pi renders `tools` -> `system` ->
  `messages` and the provider caches that prefix, so every classification flip
  invalidated the entire cached conversation. The system prompt is now byte-stable
  for a whole session; situational text is a transient tail message.
- **Unbounded tool output.** `todo_read` and `todo_diagnose` appended a
  pretty-printed JSON dump with no size limit; at the schema's maximum (200 items
  x 500 chars) that overran pi's documented 50KB / 2000-line tool-output budget.
- **Rejected mutations cleared the completion nudge.** A returned error envelope
  does not set `isError` — only a thrown error does — so failure is now detected
  from `details.error`.
- **A single ignored reminder silenced the session.** The cadence latch persisted
  until a todo tool was called. Draining now re-bases the window, so a reminder
  re-arms one interval later.
- Overlay row rendering is consistent between the themed and plain renderers.
- `content` is clamped without splitting a surrogate pair, and bidi/zero-width
  characters are stripped so stored text cannot render as something else.
- Text echoed into a `<system-reminder>` has its angle brackets neutralized, so
  a smuggled closing tag cannot escape the reminder.

### Changed

- **Context cost cut from ~1.75k to ~580 tokens per request.** The ID rule was
  stated in four places and the parallel-batch warning in three. Each rule now
  has one home: policy in the tool description, the few always-on lines in
  `promptGuidelines`, field descriptions in the schema. A test guards the budget.
- **`priority` is now optional**, defaulting to `medium`. It is metadata models
  routinely omit, and failing the call over it cost a turn for no benefit.
- **`todo_read` returns one representation**, a compact checklist with IDs and
  priorities, instead of a checklist plus a duplicate JSON copy.
- **`todo_diagnose` is now the `/todo-diagnose` command** (breaking). The model
  never needed it, and as a tool it spent description and schema tokens on every
  request.
- `prepareArguments` coerces the near-misses models actually produce
  (`status: "done"`, `priority: "P1"`, `text` for `content`, a bare object or a
  JSON string) before schema validation.
- Tools declare their `details` type through `registerTool`'s generics, removing
  the `as any` casts in the renderers — which is what surfaced the unreachable
  branch in `todo_write`'s `renderResult`.
- Overlay budget aligned to pi's own `MAX_WIDGET_LINES` (12 -> 10).
- Stale-ID wording is consistent: "Recovered stale ID(s) as new items".

### Added

- `/todos` shows the full list including finished items, `/todos reset` clears it
  after confirmation, and `/todos reminders on|off` toggles the nudges.
- `--no-todo-nudges` flag, and a footer status showing `todos done/total`.
- `tests/e2e-real-pi.test.ts`: 16 tests against the real pi runtime — real
  extension loader, tool registry, agent loop, session replay and `ctx.ui` — with
  only the model stubbed via the documented `pi.registerProvider({ streamSimple })`
  API. Each behavioural fix above was confirmed to fail these tests when reverted.
- Widget lifecycle tests, renderer tests, coercion tests, and sanitize tests.
- Biome (lint + format), coverage thresholds, and a `npm run check` script.

### Removed

- Dead exports with no production caller: `shouldNudgeColdStart`,
  `shouldNudgeCompletionUpdate`, `isTerminalList`, and the vestigial
  `OverlayLayout.terminalCount`.
- The `<Task_Management>` system-prompt section and its cold-start boost, whose
  job is now done by the stable `promptGuidelines` plus the tail-message nudge.

### Repo

- `engines.node` set to `>=22.19.0`, matching pi. CI now tests Node 22 and 24
  (20 is below pi's floor), with npm caching, least-privilege `permissions`, a
  concurrency group, and a lint step.
- Dev dependencies moved from pi 0.80.7 to **0.85.1**, and the whole suite was
  re-verified there. This mattered: the audit was originally done against 0.80.7
  while a real install runs 0.85.1, and `AuthStorage` / `ModelRegistry.inMemory`
  had been replaced by `ModelRuntime` in between. `src/` needed no change — every
  extension API it uses is unchanged, including the two this release depends on
  (`invalidate()` still means "drop cached rendering state", and RPC still drops
  component factories) — but the test harness did, and pinning dev deps to a
  version older than the runtime is how that stays invisible.


## 0.6.3 (2026-09-01)

### Reverted

- Reverted the v0.6.2 transcript-alignment rollout after the updated overlay
  proved visually rougher than the established presentation.
- Restored the complete v0.6.1 overlay, documentation, screenshot, and test
  behavior.

## 0.6.2 (2026-09-01)

### Fixed

- **Shared transcript alignment**: the live overlay follows the same column
  contract as pi-omp-theme tool surfaces. The `❏` marker starts at column 0,
  `Updated Plan` and its first tree connector start at column 2, and nested
  todo rows start at column 4.
- Updated overlay, integration, documentation, and screenshot fixtures to
  lock the aligned heading/tree geometry.

## 0.6.1 (2026-08-06)

### Fixed

- **Self-healing full writes**: `todo_write` now treats IDs from an older
  session or branch as new-item hints instead of rejecting the complete
  replacement. Duplicate stale IDs are normalized before validation; targeted
  `todo_update` patches remain strict.

## 0.6.0 (2026-07-27)

### Changed

- **Overlay redesigned**: heading changed from `# Todos (...open, ...running,
  ...done)` to `"Updated Plan"` (no counts). Items now use a tree-branch
  layout with `└` connector on the first item and `  ` indentation on
  subsequent items. Removed blank-line gap between heading and list.
- **Screenshot updated**: `media/screenshot.html` and `media/screenshot.png`
  updated to match the new overlay UI.

## 0.5.0 (2026-07-27)

### Added

- **Strikethrough for completed/cancelled items**: completed and cancelled
  todo items now render with strikethrough styling in the TUI overlay via
  `theme.strikethrough()`.

### Changed

- **Overlay heading label**: `"completed"` → `"done"` in the status line
  (e.g., `# Todos (4 open, 1 running, 3 done)`).

## 0.4.0 (2026-07-20)

### Fixed

- **Prompt policy over-injection**: removed forced "FIRST tool call must be
  todo_write" language from system prompt and tool description. The model is
  no longer required to call todo_write for explain/review/audit/debug/setup
  unless the request is genuinely multi-step.

### Changed

- **Heuristic thresholds tightened**: increased minimum lengths for
  verb-based, help-ask, sequenced-clause, substantive-length, and
  multi-sentence classification to reduce false-positive cold-start nudges.
- **LIST_MARKERS now requires ≥2 items**: a single bullet or numbered item
  no longer triggers multi-step classification.
- **EXPLICIT_TODO now requires ≥24 characters**: a short "todo" mention
  without planning context is no longer classified as multi-step.
- **Cold-start language softened**: "Call todo_write NOW" → "consider creating
  a todo list". Reminder no longer says "Do not answer without a todo list first".
- **Conditional system-prompt injection**: `TASK_MANAGEMENT_SECTION` is only
  injected when the prompt is not trivial, reducing token overhead on simple
  queries.

## 0.3.5 (2026-07-17)

### Fixed

- **Root cause of intermittent `todo_update` ID errors**: LLMs frequently
  mistype 36-char UUIDs even when IDs are visible in tool output. New todos
  now get short sequential IDs (`t1`, `t2`, …) that are trivial to copy.
- **Clearer mismatch errors**: `todo_update` lists current IDs when a patch
  targets an unknown ID, so the model can self-correct without guessing.
- Legacy UUID IDs in existing sessions remain valid; only newly assigned IDs
  use the short format.

## 0.3.4 (2026-07-17)

### Fixed

- **IDs visible in tool text**: `formatPlainTodoLine` and `todo_update` results
  now include stable IDs so models can copy them for follow-up patches.
- **`todo_update` guidance**: Description warns that IDs can change after
  `todo_write`; always `todo_read` before patching when unsure.

## 0.3.3 (2026-07-16)

### Changed

- **Overlay heading**: Shows open, running, and completed counts. Completed
  counts include only `completed` todos; `cancelled` todos remain excluded.
- **Simplified status display**: Removed the ANSI progress bar and `done/total`
  counter from the overlay.
- **Documentation and screenshot**: Updated the README, screenshot PNG, and
  screenshot HTML source to match the new heading.

## 0.3.2 (2026-07-16)

### Fixed

- **Todo ID integrity**: Prevented id-less todos from taking IDs explicitly
  retained by another todo during a full `todo_write` replacement.
- **Diagnostics**: Added ID-integrity reporting and `repair_needed` status to
  `todo_diagnose`.
- **Mutation bounds**: Capped todo mutations and persisted snapshots at 200
  items.

## 0.3.1 (2026-07-15)

### Fixed

- **Durable `todo_update` replay**: Replays successful `todo_update` tool results
  as a fallback when compaction retains tool messages but prunes older custom
  state entries. Verified in a live Pi `write → update → /compact → /reload →
  todo_diagnose` lifecycle.
- **Completion reminders**: Completion and cadence reminders now direct agents
  to patch known IDs with `todo_update`, rather than unnecessarily replacing
  the full checklist. A successful update also clears pending intent nudges.
- **Timeline overlay boundaries**: The overlay preserves checklist order,
  pins an out-of-view active item, and never renders more than `maxLines`.

## 0.3.0 (2026-07-15)

- **ID invariant hardening**: `validateTodoWrite` rejects items with explicit `id`
  that doesn't exist in current list. New items must omit `id` (auto-assign).
- **`ensureTodoIds` tuple matching**: Matches by `(content+status+priority)` first,
  then by unique content-only. Duplicate-content items get fresh UUIDs instead
  of risking mis-assignment.
- **`todo_update` atomicity**: Stale-ctx returns error, real errors propagate,
  setTodos after appendEntry — matching todo_write guarantees.
- **Status-first shared sort**: `statusPrioritySort()` extracted and shared by
  `formatTodoListText` (tool output) and `selectOverlayLayout` (overlay) —
  in_progress → pending → terminal, regardless of overflow.
- **Fixed double-count bug**: Terminal items no longer counted in both `+N done`
  AND `+N more` on overlay overflow.
- **Lifecycle E2E test**: Write → update → tree → compact → shutdown → restart,
  verifying stable IDs and status throughout.
- **125 tests**, typecheck clean, CI green (Node 20 + 22).

## 0.2.9 (2026-07-15)

- **Atomic write ordering**: `setTodos()` happens *after* `pi.appendEntry()`
  succeeds. If appendEntry throws (stale-ctx or persistence error), the in-memory
  store is never mutated — no more desync between live state and durable state.
- **Stale-ctx now returns error**: Instead of silently swallowing "stale after
  session replacement", the tool returns an error so the LLM knows the write
  was not committed.
- **4 atomicity tests**: Mock appendEntry rejects with stale-ctx / persistence
  errors and asserts store is unchanged. 102/102 tests passing.

## 0.2.8 (2026-07-15)

- **Replay**: revert broken timestamp-based hardening; Pi guarantees getBranch() is chronological, so original last-entry-wins algorithm is correct and simpler.
- **appendEntry**: only swallow stale-ctx errors; real persistence/disk errors now propagate instead of being silently caught.
- **Tests**: remove 6 broken mock-timestamp tests that never reflected Pi runtime (timestamp is ISO string, not number). Keep 9 correct persistence roundtrip tests.
- **Tests**: 96/96 pass, typecheck clean.

## 0.2.7 (2026-07-15)

- Background-color progress bar using ANSI reverse video — theme-driven (accent/muted), no alignment issues.
- Progress format: done/total with background-color bar.
- 14 integration tests for write->read->overlay roundtrip.

## 0.2.6 (2026-07-15)

## 0.2.5 (2026-07-15)

- Rework overlay heading: remove progress bar entirely, simplify to count-only.
- Fix docstring examples to match new heading format.
- README: update overlay section to remove progress bar mentions.

## 0.2.4 (2026-07-15)

- Priority sorting in overlay (high→medium→low).
- Progress bar in heading (Unicode blocks).
- Collapsible completed items (+N done).
- CI: GitHub Actions (test + typecheck on push, Node 18/20/22).
- README: npm version, license, CI badges.

## 0.2.3 (2026-07-15)

- Tool rename: todowrite → todo_write, todoread → todo_read (snake_case).
- renderCall/renderResult polish: accent color for item count.
- Overlay heading: "X open / Y total" instead of "N todo(s)".

## 0.2.2 (2026-07-15)

- Fix idle reminder text: "Open items still pending" instead of "0 open".
- Reminder hides for all-terminal lists.
- completion update reminder copy polish.

## 0.2.1 (2026-07-15)

- First usable release.
- todo_write, todo_read tools.
- Overlay with OpenCode-style markers.
- Persistence via custom entry + toolResult details.
- Cold start heuristics (multi-step, VI prompts, fix/polish/setup).
- Completion nudge when user says done.
- Idle reminder cadence every ~4 turns.
- State-aware reminder with open items list.
