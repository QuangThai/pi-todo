import { describe, expect, it } from "vitest";
import {
  buildSystemReminder,
  createCadenceState,
  drainReminderForContext,
  evaluateToolResult,
  onTurnStart,
  type CadenceConfig,
} from "../src/reminder-cadence.js";
import type { TodoItem } from "../src/types.js";

const config: CadenceConfig = {
  reminderInterval: 4,
  todoToolNames: new Set(["todowrite", "todoread"]),
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

  it("resets cadence on todowrite", () => {
    const state = createCadenceState();
    for (let i = 0; i < 5; i++) onTurnStart(state);
    evaluateToolResult(state, "bash", true, config);
    expect(state.reminderDue).toBe(true);

    evaluateToolResult(state, "todowrite", true, config);
    expect(state.reminderDue).toBe(false);
    expect(drainReminderForContext(state)).toBe(false);
  });

  it("drain injects once per cycle", () => {
    const state = createCadenceState();
    for (let i = 0; i < 4; i++) onTurnStart(state);
    evaluateToolResult(state, "read", true, config);
    expect(drainReminderForContext(state)).toBe(true);
    expect(drainReminderForContext(state)).toBe(false);
    expect(state.reminderInjectedThisCycle).toBe(true);

    // Same cycle: another non-todo tool should not re-queue
    onTurnStart(state);
    const d = evaluateToolResult(state, "bash", true, config);
    expect(d.markDue).toBe(false);
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
    expect(text).toContain("marked completed");
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
