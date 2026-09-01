# Changelog

## 0.6.2 (2026-09-01)

### Fixed

- **Shared transcript alignment**: the live overlay now follows the same
  column contract as pi-omp-theme tool surfaces. The `❏` marker starts at
  column 0, `Updated Plan` and its first tree connector start at column 2,
  and nested todo rows start at column 4.
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
