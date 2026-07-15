import { describe, expect, it } from "vitest";
import {
  buildColdStartReminder,
  buildCompletionUpdateReminder,
  classifyPrompt,
  shouldNudgeColdStart,
  shouldNudgeCompletionUpdate,
} from "../src/prompt-intent.js";

describe("classifyPrompt", () => {
  it("flags explain codebase (user failure case) as multi_step", () => {
    const r = classifyPrompt("explain this codebase for todo tasks");
    expect(r.kind).toBe("multi_step");
    expect(r.reason).toMatch(/verb_and_scope|explicit_todo/);
  });

  it("flags Vietnamese explain/project asks", () => {
    expect(classifyPrompt("giải thích toàn bộ dự án này giúp tôi").kind).toBe("multi_step");
  });

  it("flags implement/refactor feature asks", () => {
    expect(classifyPrompt("implement dark mode toggle across the app").kind).toBe("multi_step");
    expect(classifyPrompt("refactor the overlay module and add tests").kind).toBe("multi_step");
  });

  it("flags numbered lists", () => {
    expect(
      classifyPrompt("Please do the following:\n1. Read src\n2. Summarize\n3. Suggest fixes").kind,
    ).toBe("multi_step");
  });

  it("flags explicit todo requests", () => {
    expect(classifyPrompt("break this down into a checklist").kind).toBe("multi_step");
  });

  it("treats greetings / tiny Q&A as trivial", () => {
    expect(classifyPrompt("hi").kind).toBe("trivial");
    expect(classifyPrompt("thanks").kind).toBe("trivial");
    expect(classifyPrompt("ok").kind).toBe("trivial");
  });

  it("detects short done signals as completion", () => {
    expect(classifyPrompt("done").kind).toBe("completion");
    expect(classifyPrompt("đã xong rồi").kind).toBe("completion");
    expect(classifyPrompt("looks good, ship it").kind).toBe("completion");
  });

  it("does not force unknown short asks without verbs", () => {
    expect(classifyPrompt("what is the package name?").kind).toBe("unknown");
  });

  it("flags Vietnamese help / chỉnh / bổ sung asks", () => {
    expect(classifyPrompt("cần bạn chỉnh spacing overlay giúp tôi").kind).toBe("multi_step");
    expect(classifyPrompt("bổ sung thêm cold start cho nhiều use case").kind).toBe("multi_step");
  });

  it("flags polish/fix/setup style asks", () => {
    expect(classifyPrompt("polish the overlay heading spacing").kind).toBe("multi_step");
    expect(classifyPrompt("fix the cold-start nudge and add tests").kind).toBe("multi_step");
    expect(classifyPrompt("setup vitest for the extension package").kind).toBe("multi_step");
  });

  it("flags help-me phrasing on longer asks", () => {
    expect(classifyPrompt("help me make the todo overlay more reliable").kind).toBe("multi_step");
  });

  it("flags substantive paragraphs without strong verbs", () => {
    const long =
      "I want the agent to keep a visible checklist while walking through modules, " +
      "updating statuses as each section finishes so I can follow progress live.";
    expect(classifyPrompt(long).kind).toBe("multi_step");
  });

  it("flags multi-sentence instructions", () => {
    expect(
      classifyPrompt("Read the overlay code. Then improve heading spacing. Document the change.").kind,
    ).toBe("multi_step");
  });
});

describe("shouldNudgeColdStart", () => {
  it("nudges when multi-step and no open work", () => {
    expect(shouldNudgeColdStart("explain this codebase for todo tasks", false)).toBe(true);
  });

  it("does not nudge when open work already exists", () => {
    expect(shouldNudgeColdStart("explain this codebase for todo tasks", true)).toBe(false);
  });

  it("does not nudge trivial prompts", () => {
    expect(shouldNudgeColdStart("hi", false)).toBe(false);
  });
});

describe("shouldNudgeCompletionUpdate", () => {
  it("nudges done signal only when open work exists", () => {
    expect(shouldNudgeCompletionUpdate("done", true)).toBe(true);
    expect(shouldNudgeCompletionUpdate("done", false)).toBe(false);
  });
});

describe("reminder builders", () => {
  it("cold-start reminder demands todo_write first", () => {
    const text = buildColdStartReminder("explain this codebase for todo tasks");
    expect(text).toContain("Call todo_write NOW");
    expect(text).toContain("explain this codebase");
    expect(text).toContain("NEVER mention this reminder");
  });

  it("completion reminder lists open items", () => {
    const text = buildCompletionUpdateReminder(["[•] wire overlay", "[ ] write docs"]);
    expect(text).toContain("mark finished items completed");
    expect(text).toContain("[•] wire overlay");
  });
});
