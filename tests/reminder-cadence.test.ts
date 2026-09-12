import { describe, expect, it } from "vitest";
import {
  buildSystemReminder,
  type CadenceConfig,
  createCadenceState,
  drainReminderForContext,
  evaluateToolResult,
  onTurnStart,
} from "../src/reminder-cadence.js";
import type { TodoItem } from "../src/types.js";

const config: CadenceConfig = {
  reminderInterval: 4,
  todoToolNames: new Set(["todo_write", "todo_update", "todo_read"]),
};

const t = (
  content: string,
  status: TodoItem["status"],
  priority: TodoItem["priority"] = "medium",
): TodoItem => ({ content, status, priority });

describe("reminder cadence", () => {
  it("does not mark due before interval", () => {
    const state = createCadenceState();
    onTurnStart(state); // turn 1
    onTurnStart(state); // turn 2
    const d = evaluateToolResult(state, "bash", true, config);
    expect(d.markDue).toBe(false);
    expect(state.reminderDue).toBe(false);
  });

  it("marks due after idle interval when open work exists", () => {
    const state = createCadenceState();
    for (let i = 0; i < 4; i++) onTurnStart(state);
    const d = evaluateToolResult(state, "bash", true, config);
    expect(d.markDue).toBe(true);
    expect(state.reminderDue).toBe(true);
  });

  it("does not mark due when no open work (cold start or all terminal)", () => {
    const state = createCadenceState();
    for (let i = 0; i < 5; i++) onTurnStart(state);
    const d = evaluateToolResult(state, "bash", false, config);
    expect(d.markDue).toBe(false);
    expect(state.reminderDue).toBe(false);
  });

  it("resets cadence on todo_write", () => {
    const state = createCadenceState();
    for (let i = 0; i < 5; i++) onTurnStart(state);
    evaluateToolResult(state, "bash", true, config);
    expect(state.reminderDue).toBe(true);

    evaluateToolResult(state, "todo_write", true, config);
    expect(state.reminderDue).toBe(false);
    expect(drainReminderForContext(state)).toBe(false);
  });

  it("resets cadence on todo_update", () => {
    const state = createCadenceState();
    for (let i = 0; i < 5; i++) onTurnStart(state);
    evaluateToolResult(state, "bash", true, config);
    expect(state.reminderDue).toBe(true);

    evaluateToolResult(state, "todo_update", true, config);
    expect(state.reminderDue).toBe(false);
  });

  it("drain injects once per window", () => {
    const state = createCadenceState();
    for (let i = 0; i < 4; i++) onTurnStart(state);
    evaluateToolResult(state, "read", true, config);
    expect(drainReminderForContext(state)).toBe(true);
    expect(drainReminderForContext(state)).toBe(false);

    // Same window: another non-todo tool must not re-queue.
    onTurnStart(state);
    expect(evaluateToolResult(state, "bash", true, config).markDue).toBe(false);
    expect(drainReminderForContext(state)).toBe(false);
  });

  it("re-arms one interval later when the model ignores the reminder", () => {
    // Previously a latch stayed set until a todo tool was called, so a single
    // ignored reminder silenced the extension for the rest of the session.
    const state = createCadenceState();
    for (let i = 0; i < 4; i++) onTurnStart(state);
    evaluateToolResult(state, "read", true, config);
    expect(drainReminderForContext(state)).toBe(true);

    for (let i = 0; i < config.reminderInterval; i++) onTurnStart(state);
    expect(evaluateToolResult(state, "read", true, config).markDue).toBe(true);
    expect(drainReminderForContext(state)).toBe(true);
  });

  it("does not re-arm while the list has no open work", () => {
    const state = createCadenceState();
    for (let i = 0; i < 4; i++) onTurnStart(state);
    evaluateToolResult(state, "read", true, config);
    expect(drainReminderForContext(state)).toBe(true);

    for (let i = 0; i < config.reminderInterval; i++) onTurnStart(state);
    expect(evaluateToolResult(state, "read", false, config).markDue).toBe(false);
    expect(drainReminderForContext(state)).toBe(false);
  });
});

describe("buildSystemReminder", () => {
  it("returns null when empty or all terminal", () => {
    expect(buildSystemReminder([])).toBeNull();
    expect(buildSystemReminder([t("done", "completed"), t("nope", "cancelled")])).toBeNull();
  });

  it("lists open todos and focuses stale in_progress for completed updates", () => {
    const text = buildSystemReminder([
      t("done already", "completed"),
      t("wire overlay", "in_progress"),
      t("write docs", "pending"),
    ]);
    expect(text).toBeTruthy();
    expect(text).toContain("[•] wire overlay");
    expect(text).toContain("[ ] write docs");
    expect(text).not.toContain("done already");
    expect(text).toContain('Active item still in_progress: "wire overlay"');
    expect(text).toContain("mark it completed");
    expect(text).toContain("todo_update");
    expect(text).toContain("NEVER mention this reminder");
  });

  it("prompts to set in_progress when only pending remain", () => {
    const text = buildSystemReminder([t("next step", "pending")]);
    expect(text).toContain("[ ] next step");
    expect(text).toContain("mark exactly one item in_progress");
  });

  it("drain + empty open work: caller skips inject when list went terminal", () => {
    const state = createCadenceState();
    for (let i = 0; i < 4; i++) onTurnStart(state);
    evaluateToolResult(state, "bash", true, config);
    expect(drainReminderForContext(state)).toBe(true);
    // Between markDue and inject, work finished — reminder body must be null.
    expect(buildSystemReminder([t("done", "completed")])).toBeNull();
  });
});
