# Tasks: pi-todo

## Cold-start reliability (2026-07-15)

- [x] Prompt-aware cold start (`src/prompt-intent.ts` + `before_agent_start` + one-shot `context` reminder)
- [x] Completion nudge when user says done and open work remains
- [x] Clear intent nudge after successful `todowrite`
- [x] Unit tests for explain-codebase / VI / lists / trivial / done
- [x] Suite: `npm test` + `npm run typecheck` (73 tests)

## Spacing + broader cold-start (same day)

- [x] Blank line under `# Todos (N open, M running)` heading
- [x] Widen EN/VI heuristics (fix/polish/help-me/long asks/multi-sentence)
- [x] Suite green after wording/spacing updates

## User dogfood after `/reload`

- [ ] Multi-step prompts (explain / chỉnh / bổ sung / help me…) → first tool `todowrite`, overlay with heading gap
- [ ] If model still skips once, say “create todos first” (model compliance limit)
