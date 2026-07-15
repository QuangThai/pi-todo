# Changelog

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
