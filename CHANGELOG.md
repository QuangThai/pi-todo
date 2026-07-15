# Changelog

## 0.2.4 (2026-07-15)

- README: add npm/CI/license badges.
- Add GitHub Actions CI workflow (test + typecheck on push).
- Overlay: sort items by priority (high → medium → low) within each status group.
- Overlay: add progress bar (`████░░░░ 60%`) in heading.
- Overlay: collapse completed/cancelled items into `+N done` when space is tight.
- README: update overlay description + tool names to match v0.2.3.

## 0.2.3 (2026-07-15)

- Rename tools to snake_case: `todowrite` → `todo_write`, `todoread` → `todo_read` (pi convention).
- Improve renderCall/renderResult: accent color for item count, "X open / Y total" instead of "N todo(s)".
- Update all prompt references to match new tool names.

## 0.2.2 (2026-07-15)

- Add gallery screenshot to pi manifest for pi.dev/packages listing.

## 0.2.1 (2026-07-15)

- Overlay heading spacing: add blank line + `maxLines-1` budget for clean visual separation.
- Strip pi-tasks/Model guidance sections from README.

## 0.2.0 (2026-07-15)

- First npm publish as `@nguyenquangthai/pi-todo`.
- Polish repo metadata (LICENSE, README, package.json) for public distribution.
- Expand cold-start heuristics to cover more multi-step prompts (EN/VI).
- Add blank line under overlay heading for visual spacing.
