import { describe, expect, it } from "vitest";
import { clampTodoText, sanitizeTodoText } from "../src/sanitize.js";
import { MAX_CONTENT_LENGTH } from "../src/types.js";
import { validateTodoWrite } from "../src/validate.js";

const ESC = String.fromCharCode(0x1b);
const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b);
const RIGHT_TO_LEFT_OVERRIDE = String.fromCharCode(0x202e);
const POP_DIRECTIONAL_ISOLATE = String.fromCharCode(0x2069);
const BOM = String.fromCharCode(0xfeff);

describe("sanitizeTodoText", () => {
  it("strips ANSI colour and collapses whitespace", () => {
    expect(sanitizeTodoText(`${ESC}[31mred${ESC}[0m   text\n\nhere`)).toBe("red text here");
  });

  it("strips a bare ESC left by a non-SGR sequence", () => {
    // Control characters become a space rather than vanishing, so removing one
    // cannot silently join two words into a different one.
    expect(sanitizeTodoText(`title${ESC}]0;window${String.fromCharCode(7)}`)).toBe("title ]0;window");
  });

  it("removes bidi overrides and zero-width characters", () => {
    // These render the stored text as something else in the overlay: an RLO can
    // reverse a visible task title while the persisted content is unchanged.
    const spoofed = `deploy${RIGHT_TO_LEFT_OVERRIDE}prod${POP_DIRECTIONAL_ISOLATE}`;
    expect(sanitizeTodoText(spoofed)).toBe("deployprod");
    expect(sanitizeTodoText(`a${ZERO_WIDTH_SPACE}b${BOM}c`)).toBe("abc");
  });

  it("keeps ordinary unicode, including non-Latin scripts and emoji", () => {
    expect(sanitizeTodoText("rà soát repo 🎯")).toBe("rà soát repo 🎯");
  });

  it("is applied by validation", () => {
    const result = validateTodoWrite(
      [{ content: `x${RIGHT_TO_LEFT_OVERRIDE}y`, status: "pending", priority: "low" }],
      [],
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.todos[0].content).toBe("xy");
  });
});

describe("clampTodoText", () => {
  it("leaves short text untouched", () => {
    expect(clampTodoText("short", 100)).toBe("short");
  });

  it("clamps to exactly max characters including the ellipsis", () => {
    const clamped = clampTodoText("a".repeat(50), 10);
    expect(clamped).toHaveLength(10);
    expect(clamped.endsWith("…")).toBe(true);
  });

  it("never splits a surrogate pair", () => {
    // "🎯" is two code units. Cutting between them would leave a lone surrogate,
    // which renders as a replacement glyph and breaks JSON round-trips.
    const text = `${"a".repeat(8)}🎯🎯🎯`;
    const clamped = clampTodoText(text, 10);
    expect(clamped).toBe("aaaaaaaa…");
    expect(isWellFormed(clamped)).toBe(true);

    for (let max = 4; max <= 14; max++) {
      expect(isWellFormed(clampTodoText(text, max))).toBe(true);
    }
  });

  it("bounds persisted content at MAX_CONTENT_LENGTH", () => {
    const result = validateTodoWrite(
      [{ content: `${"y".repeat(MAX_CONTENT_LENGTH + 200)}🎯`, status: "pending", priority: "low" }],
      [],
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.todos[0].content).toHaveLength(MAX_CONTENT_LENGTH);
      expect(isWellFormed(result.todos[0].content)).toBe(true);
    }
  });
});

/** True when the string contains no unpaired surrogate. */
function isWellFormed(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const isHigh = code >= 0xd800 && code <= 0xdbff;
    const isLow = code >= 0xdc00 && code <= 0xdfff;
    if (isHigh) {
      const next = text.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      i++;
    } else if (isLow) {
      return false;
    }
  }
  return true;
}
