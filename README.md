# pi-todo

OpenCode-style session todo checklist for the [pi coding agent](https://pi.dev).

Adds `todowrite` / `todoread`, a live `# Todos` overlay above the editor (`[ ]` / `[•]` / `[✓]` / `[×]`), and branch-replay persistence (survives `/reload`, tree nav, and custom-entry durability across compaction).

## Install

**Important:** uninstall any competing task extension first (especially `@tintinweb/pi-tasks`) to avoid dual task systems:

```bash
pi remove npm:@tintinweb/pi-tasks
pi install /absolute/path/to/pi-todo
```

Or from this repo:

```bash
pi install D:/Personal/pi-todo
```

Then restart pi or run `/reload`.

## Tools

### `todowrite`

Full-replace the session todo list. Each call must pass the **complete** list.

```json
{
  "todos": [
    { "content": "Wire overlay", "status": "completed", "priority": "high" },
    { "content": "Add tests", "status": "in_progress", "priority": "high" },
    { "content": "Write README", "status": "pending", "priority": "medium" }
  ]
}
```

Rules enforced by the tool:

- Exactly **one** `in_progress` allowed (hard reject if more)
- `content` required (non-empty after sanitize); max **500** chars (longer values truncated)
- `priority` required: `high` | `medium` | `low`
- Status: `pending` | `in_progress` | `completed` | `cancelled`
- Tool text echo caps at **40** lines (`+N more` in the text body; full list still in `details` / JSON)

### `todoread`

Returns the current list as text + JSON. Prefer the overlay for at-a-glance status; avoid calling it in the same parallel batch as `todowrite`.

## Overlay

Shown above the editor while any **open** todo remains (`pending` / `in_progress`).

Hidden when the list is empty or every item is `completed` / `cancelled`.

Heading shows open + running counts, e.g. `# Todos (2 open, 1 running)`:
- **open** = `pending` + `in_progress`
- **running** = `in_progress` only (0 or 1 after a valid write)

There is a blank line under the heading so it is not flush against the first todo row.

## Model guidance

Overlay **never** auto-updates from chat. Status changes only when the model calls `todowrite`.

| Layer | Purpose | Source |
|-------|---------|--------|
| `before_agent_start` `<Task_Management>` | Baseline every agent run | pi-todotools |
| **Prompt-aware cold start** | Multi-step ask (EN/VI: explain, fix, polish, help me, lists, long asks…) **and** empty list → system boost + one-shot `<system-reminder>` | hybrid |
| **Prompt-aware completion** | If user says done/approved **and** open work remains → one-shot update reminder | hybrid |
| Tool description + `promptGuidelines` | Detailed when/how + complete-as-you-go | OpenCode / rpiv |
| Idle `<system-reminder>` via `context` | After ~4 turns without todo tools **while open work remains** | pi-tasks cadence |
| State-aware reminder body | Lists open items; if one is `in_progress`, nudges mark `completed` + advance next | edxeth/meh pi-tasks |

Cold-start heuristics cover many prompts beyond “explain codebase”: implement/fix/polish/setup, Vietnamese (giải thích, chỉnh, bổ sung…), help-me phrasing, numbered lists, multi-sentence, and longer substantive asks. Skip remains for greetings and short factoids.

Not implemented (intentionally): inventing todo items from chat without a model `todowrite`; agent_settled auto-continuation (removed upstream in pi-todotools).

**After `/reload`:** multi-step asks should get a cold-start reminder on the first LLM turn. If a model still skips, say “create todos first” once — that is a model compliance limit, not a missing overlay bug.

## Development

```bash
npm install
npm test
npm run typecheck
pi -e ./src/index.ts
```

## License

MIT
