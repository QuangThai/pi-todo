import { StringEnum } from "@earendil-works/pi-ai";
import { Type, type Static } from "typebox";
import { TODO_PRIORITIES, TODO_STATUSES } from "./types.js";

export const TodoItemSchema = Type.Object({
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

export type TodoWriteInput = Static<typeof TodoWriteParams>;
export type TodoItemInput = Static<typeof TodoItemSchema>;
