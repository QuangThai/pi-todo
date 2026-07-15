# pi-todo

OpenCode-style session todo checklist for the [pi coding agent](https://pi.dev).

Adds `todowrite` / `todoread`, a live `# Todos` overlay above the editor (`[ ]` / `[•]` / `[✓]` / `[×]`), and branch-replay persistence (survives `/reload`, tree nav, and custom-entry durability across compaction).

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
