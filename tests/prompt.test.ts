import { describe, expect, it } from "vitest";
import {
  TASK_MANAGEMENT_SECTION,
  TODOWRITE_DESCRIPTION,
  TODOWRITE_GUIDELINES,
} from "../src/prompt.js";

describe("prompt guidance", () => {
  it("TASK_MANAGEMENT_SECTION nudges cold-start todo_write for explain/explore", () => {
    expect(TASK_MANAGEMENT_SECTION).toContain("todo_write");
    expect(TASK_MANAGEMENT_SECTION).toMatch(/explain\/explore\/review/i);
    expect(TASK_MANAGEMENT_SECTION).toMatch(/FIRST tool call must be todo_write/i);
    expect(TASK_MANAGEMENT_SECTION).toMatch(/giải thích|chỉnh|bổ sung/i);
  });

  it("COLD_START_BOOST is present for prompt-aware path", async () => {
    const { COLD_START_BOOST } = await import("../src/prompt.js");
    expect(COLD_START_BOOST).toContain("COLD START ACTIVE");
    expect(COLD_START_BOOST).toContain("Call todo_write before any other tool");
  });

  it("tool description treats multi-step explain as when-to-use, not skip", () => {
    expect(TODOWRITE_DESCRIPTION).toContain("Explain / explore / review");
    expect(TODOWRITE_DESCRIPTION).toContain(
      'Do **not** skip just because the request is "explain" or "review"',
    );
    expect(TODOWRITE_GUIDELINES[0]).toMatch(/explain\/explore\/review/i);
  });

  it("documents todo_update as the ID-based patch tool", () => {
    expect(TODOWRITE_GUIDELINES.join("\n")).toContain("todo_update");
    expect(TASK_MANAGEMENT_SECTION).toContain("todo_update");
  });
});
