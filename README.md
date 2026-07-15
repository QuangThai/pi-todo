# pi-todo

[![npm version](https://img.shields.io/npm/v/@nguyenquangthai/pi-todo?color=blue)](https://www.npmjs.com/package/@nguyenquangthai/pi-todo)
[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![Tests](https://github.com/QuangThai/pi-todo/actions/workflows/ci.yml/badge.svg)](https://github.com/QuangThai/pi-todo/actions)

OpenCode-style session todo checklist for the [pi coding agent](https://pi.dev).

Adds `todo_write` / `todo_read` / `todo_diagnose`, a live `# Todos` overlay above the editor (`[ ]` / `[•]` / `[✓]` / `[×]`), and branch-replay persistence (survives `/reload`, tree nav, and custom-entry durability across compaction).

## Install

```bash
pi install npm:@nguyenquangthai/pi-todo
```

Or from source:

```bash
git clone https://github.com/QuangThai/pi-todo.git
cd pi-todo
pi install .
```

Then restart pi or run `/reload`.

## Tools

### `todo_write`

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

### `todo_read`

Returns the current list as text + JSON. Prefer the overlay for at-a-glance status; avoid calling it in the same parallel batch as `todo_write`.

### `todo_diagnose`

Read-only persistence check for suspected reload, tree-navigation, or compaction drift. It compares the live in-memory snapshot against a replay of the durable session branch and reports `consistent` or `mismatch`; it never changes todos.

## Overlay

Shown above the editor while any **open** todo remains (`pending` / `in_progress`).

Hidden when the list is empty or every item is `completed` / `cancelled`.

Heading shows open + running counts + background-color progress bar, e.g. `# Todos (3 open, 1 running) ▓▓▓▓░░░░ 1/4`:

- **open** = `pending` + `in_progress`
- **running** = `in_progress` only (0 or 1 after a valid write)
- **progress bar** = ANSI background color via reverse video, using theme `accent` (filled) and `muted` (empty)

Items within each status group are sorted by priority (high → medium → low).
When space is tight, completed/cancelled items collapse into `+N done`.
A blank line separates the heading from the first todo row for visual breathing room.
Successful `todo_write` results display `✓ Saved`, meaning the durable checkpoint was accepted before the in-memory snapshot was updated.

## Development

```bash
git clone https://github.com/QuangThai/pi-todo.git
cd pi-todo
npm install
npm test
npm run typecheck
pi -e ./src/index.ts
```

## License

[MIT](./LICENSE) © QuangThai
