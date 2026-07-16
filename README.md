# pi-todo

[![npm version](https://img.shields.io/npm/v/@nguyenquangthai/pi-todo?color=blue)](https://www.npmjs.com/package/@nguyenquangthai/pi-todo)
[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![Tests](https://github.com/QuangThai/pi-todo/actions/workflows/ci.yml/badge.svg)](https://github.com/QuangThai/pi-todo/actions)

OpenCode-style session todo checklist for the [pi coding agent](https://pi.dev).

Adds `todo_write` / `todo_update` / `todo_read` / `todo_diagnose`, a live `# Todos` overlay above the editor (`[ ]` / `[•]` / `[✓]` / `[×]`), and branch-replay persistence (survives `/reload`, tree nav, and custom-entry durability across compaction).

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
- **ID rule:** omit `id` for a new item; the system assigns it. Only include an ID returned by `todo_read` when retaining an existing item. Never invent an ID. Replacing the list does not inherently reset IDs: matching existing items can retain them.
- For changed, repeated, or long/truncated content, include the exact existing ID rather than relying on automatic content matching.
- Do not call `todo_write` and a `todo_update` that needs its IDs in the same parallel batch. Wait for the write result, then use returned IDs or call `todo_read`.
- A mutation can contain at most **200** todos/updates.
- Array order is the workflow timeline. Keep existing positions when statuses change; only add or reorder items intentionally.
- Tool text echo caps at **40** lines (`+N more` in the text body; full list still in `details` / JSON)

### `todo_update`

Patch existing todos by stable ID without replacing the list or changing its order. `id` is required, must be a non-empty string, and must match a current todo; use `todo_read` first to obtain it. This tool never deletes items.

If an older session returns a todo without `id`, it cannot be patched with `todo_update`. Call `todo_write` with that item but omit `id` to assign one, then use `todo_update` normally.

```json
{
  "updates": [
    { "id": "existing-todo-id", "status": "completed" }
  ]
}
```

### `todo_read`

Returns the current list as text + JSON. Prefer the overlay for at-a-glance status; use it to obtain stable IDs before `todo_update`, and avoid calling it in the same parallel batch as a todo mutation.

### `todo_diagnose`

Read-only persistence check for suspected reload, tree-navigation, or compaction drift. It compares the live in-memory snapshot against a replay of the durable session branch and reports `consistent`, `mismatch`, or `repair_needed` when duplicate/missing IDs are found; it never changes todos.

## Overlay

Shown above the editor while any **open** todo remains (`pending` / `in_progress`).

Hidden when the list is empty or every item is `completed` / `cancelled`.

Heading shows open, running, and completed counts, e.g. `# Todos (3 open, 1 running, 1 completed)`:

- **open** = `pending` + `in_progress`
- **running** = `in_progress` only (0 or 1 after a valid write)
- **completed** = `completed` only; `cancelled` todos are not counted

Items always stay in the array's workflow order; status changes only their marker/color.
When space is tight, the overlay shows the earliest checklist items and `+N more`. If the active item is outside that prefix, it is repeated as `Active: [•] …` rather than moved ahead of earlier work.
A blank line separates the heading from the first todo row for visual breathing room.
Successful `todo_write` and `todo_update` results display `✓ Saved`, meaning the durable checkpoint was accepted before the in-memory snapshot was updated.

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
