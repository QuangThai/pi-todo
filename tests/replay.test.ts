import { describe, expect, it } from "vitest";
import { replayFromBranch } from "../src/replay.js";
import { TODO_STATE_ENTRY_TYPE, TOOL_WRITE } from "../src/types.js";

function branch(entries: unknown[]) {
  return {
    sessionManager: {
      getBranch: () => entries,
    },
  };
}

describe("replayFromBranch", () => {
  it("returns empty for empty branch", () => {
    expect(replayFromBranch(branch([]))).toEqual([]);
  });

  it("takes last todowrite details", () => {
    const entries = [
      {
        type: "message",
        message: {
          role: "toolResult",
          toolName: TOOL_WRITE,
          details: {
            todos: [{ content: "old", status: "pending", priority: "low" }],
          },
        },
      },
      {
        type: "message",
        message: {
          role: "toolResult",
          toolName: TOOL_WRITE,
          details: {
            todos: [{ content: "new", status: "in_progress", priority: "high" }],
          },
        },
      },
    ];
    expect(replayFromBranch(branch(entries))).toEqual([
      { content: "new", status: "in_progress", priority: "high" },
    ]);
  });

  it("skips error envelopes", () => {
    const entries = [
      {
        type: "message",
        message: {
          role: "toolResult",
          toolName: TOOL_WRITE,
          details: {
            todos: [{ content: "ok", status: "pending", priority: "medium" }],
          },
        },
      },
      {
        type: "message",
        message: {
          role: "toolResult",
          toolName: TOOL_WRITE,
          details: {
            todos: [{ content: "ok", status: "pending", priority: "medium" }],
            error: "exactly one in_progress allowed",
          },
        },
      },
    ];
    expect(replayFromBranch(branch(entries))).toEqual([
      { content: "ok", status: "pending", priority: "medium" },
    ]);
  });

  it("prefers later custom entry over earlier tool result", () => {
    const entries = [
      {
        type: "message",
        message: {
          role: "toolResult",
          toolName: TOOL_WRITE,
          details: {
            todos: [{ content: "from-tool", status: "pending", priority: "low" }],
          },
        },
      },
      {
        type: "custom",
        customType: TODO_STATE_ENTRY_TYPE,
        data: {
          todos: [{ content: "from-entry", status: "completed", priority: "medium" }],
        },
      },
    ];
    expect(replayFromBranch(branch(entries))).toEqual([
      { content: "from-entry", status: "completed", priority: "medium" },
    ]);
  });
});
