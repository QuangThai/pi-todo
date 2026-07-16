import { StringEnum } from "@earendil-works/pi-ai";
import { Type, type Static } from "typebox";
import { MAX_TODO_ITEMS, TODO_PRIORITIES, TODO_STATUSES } from "./types.js";

export const TodoItemSchema = Type.Object({
  id: Type.Optional(Type.String({ minLength: 1, description: "Stable ID of an existing todo. Omit for new items; never invent an ID. Preserve only an ID returned by todo_read/current list." })),
  content: Type.String({ description: "Brief description of the task" }),
  status: StringEnum([...TODO_STATUSES], {
    description: "pending | in_progress | completed | cancelled",
  }),
  priority: StringEnum([...TODO_PRIORITIES], {
    description: "high | medium | low",
  }),
});

export const TodoWriteParams = Type.Object({
  todos: Type.Array(TodoItemSchema, {
    maxItems: MAX_TODO_ITEMS,
    description: `The complete updated todo list (full replace, at most ${MAX_TODO_ITEMS} items). Any supplied ID must already exist; omit ID for a new item.`,
  }),
});

export const TodoReadParams = Type.Object({});

/** Read-only persistence check; deliberately accepts no mutation input. */
export const TodoDiagnoseParams = Type.Object({});

export const TodoUpdateParams = Type.Object({
  updates: Type.Array(
    Type.Object({
      id: Type.String({ minLength: 1, description: "Existing stable ID from todo_read; it must match a current todo" }),
      content: Type.Optional(Type.String()),
      status: Type.Optional(StringEnum([...TODO_STATUSES])),
      priority: Type.Optional(StringEnum([...TODO_PRIORITIES])),
    }),
      { minItems: 1, maxItems: MAX_TODO_ITEMS, description: `Patch at most ${MAX_TODO_ITEMS} existing todos by stable ID` },
  ),
});

export type TodoWriteInput = Static<typeof TodoWriteParams>;
export type TodoItemInput = Static<typeof TodoItemSchema>;
