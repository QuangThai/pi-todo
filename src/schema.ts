import { StringEnum } from "@earendil-works/pi-ai";
import { Type, type Static } from "typebox";
import { TODO_PRIORITIES, TODO_STATUSES } from "./types.js";

export const TodoItemSchema = Type.Object({
  id: Type.Optional(Type.String({ minLength: 1, description: "Stable todo ID; preserve it when rewriting an existing item" })),
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
    description: "The complete updated todo list (full replace)",
  }),
});

export const TodoReadParams = Type.Object({});

/** Read-only persistence check; deliberately accepts no mutation input. */
export const TodoDiagnoseParams = Type.Object({});

export const TodoUpdateParams = Type.Object({
  updates: Type.Array(
    Type.Object({
      id: Type.String({ minLength: 1 }),
      content: Type.Optional(Type.String()),
      status: Type.Optional(StringEnum([...TODO_STATUSES])),
      priority: Type.Optional(StringEnum([...TODO_PRIORITIES])),
    }),
    { minItems: 1, description: "Patch existing todos by stable ID" },
  ),
});

export type TodoWriteInput = Static<typeof TodoWriteParams>;
export type TodoItemInput = Static<typeof TodoItemSchema>;
