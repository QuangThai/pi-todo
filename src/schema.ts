import { StringEnum } from "@earendil-works/pi-ai";
import { type Static, Type } from "typebox";
import { MAX_TODO_ITEMS, TODO_PRIORITIES, TODO_STATUSES } from "./types.js";

/**
 * Field descriptions only. Policy — when to use the tool, the full-replace
 * contract, the ID rules — lives in the tool description (see prompt.ts), so it
 * is not restated here; the enum values themselves are already in the schema.
 */
export const TodoItemSchema = Type.Object({
  id: Type.Optional(
    Type.String({
      minLength: 1,
      description: "ID of an existing todo to keep. Omit for a new item.",
    }),
  ),
  content: Type.String({ description: "Short description of the task" }),
  status: StringEnum([...TODO_STATUSES]),
  priority: Type.Optional(StringEnum([...TODO_PRIORITIES], { description: "Defaults to medium" })),
});

export const TodoWriteParams = Type.Object({
  todos: Type.Array(TodoItemSchema, {
    maxItems: MAX_TODO_ITEMS,
    description: `The complete todo list after this call (full replace, at most ${MAX_TODO_ITEMS} items)`,
  }),
});

export const TodoReadParams = Type.Object({});

export const TodoUpdateParams = Type.Object({
  updates: Type.Array(
    Type.Object({
      id: Type.String({ minLength: 1, description: "ID of a todo that exists right now" }),
      content: Type.Optional(Type.String()),
      status: Type.Optional(StringEnum([...TODO_STATUSES])),
      priority: Type.Optional(StringEnum([...TODO_PRIORITIES])),
    }),
    { minItems: 1, maxItems: MAX_TODO_ITEMS, description: "Patches to apply, keyed by existing ID" },
  ),
});

export type TodoWriteInput = Static<typeof TodoWriteParams>;
export type TodoUpdateInput = Static<typeof TodoUpdateParams>;
export type TodoItemInput = Static<typeof TodoItemSchema>;
