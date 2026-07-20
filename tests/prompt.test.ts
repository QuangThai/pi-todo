import { describe, expect, it } from "vitest";
import {
  TASK_MANAGEMENT_SECTION,
  TODOWRITE_DESCRIPTION,
  TODOWRITE_GUIDELINES,
} from "../src/prompt.js";

describe("prompt guidance", () => {
  it("TASK_MANAGEMENT_SECTION guides multi-step planning without forcing", () => {
    expect(TASK_MANAGEMENT_SECTION).toContain("todo_write");
    expect(TASK_MANAGEMENT_SECTION).toMatch(/genuinely multi-step/i);
    expect(TASK_MANAGEMENT_SECTION).toMatch(/skip planning and proceed directly/i);
    expect(TASK_MANAGEMENT_SECTION).not.toMatch(/FIRST tool call must/i);
  });

  it("COLD_START_BOOST suggests rather than commands", async () => {
    const { COLD_START_BOOST } = await import("../src/prompt.js");
    expect(COLD_START_BOOST).toContain("consider creating a todo list");
    expect(COLD_START_BOOST).not.toContain("Call todo_write before any other tool");
  });

  it("tool description lists appropriate use cases without forcing", () => {
    expect(TODOWRITE_DESCRIPTION).toContain("Good candidates for todo tracking");
    expect(TODOWRITE_DESCRIPTION).toContain("3+ distinct steps");
    expect(TODOWRITE_DESCRIPTION).toContain("explicitly asks for planning");
    expect(TODOWRITE_DESCRIPTION).toContain("simple even if it uses words like \"explain\"");
    expect(TODOWRITE_GUIDELINES[0]).toMatch(/todo_write helps track progress/i);
  });

  it("documents todo_update as the ID-based patch tool", () => {
    expect(TODOWRITE_GUIDELINES.join("\n")).toContain("todo_update");
    expect(TASK_MANAGEMENT_SECTION).toContain("todo_update");
  });

  it("documents ID rules for new writes and targeted updates", () => {
    const guidance = `${TODOWRITE_DESCRIPTION}\n${TODOWRITE_GUIDELINES.join("\n")}\n${TASK_MANAGEMENT_SECTION}`;
    expect(guidance).toMatch(/omit .*id.*new item/i);
    expect(guidance).toMatch(/todo_update.*id.*required/i);
    expect(guidance).toMatch(/never invent/i);
    expect(guidance).toMatch(/same parallel batch/i);
    expect(guidance).toMatch(/legacy item without id/i);
  });
});
