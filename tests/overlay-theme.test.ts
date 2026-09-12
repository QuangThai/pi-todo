import { Theme, type ThemeColor } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import { renderOverlayLines, renderOverlayPlainLines } from "../src/format.js";
import type { TodoItem } from "../src/types.js";

/**
 * The overlay is rendered with a real `Theme`, so every row carries ANSI escape
 * sequences before it is truncated to the terminal width. The other suites use an
 * identity theme, which silently skips that interaction: a renderer that composes
 * coloured text and then truncates can cut a line mid-escape, leak colour into the
 * rest of the frame, or mis-measure width and overflow the widget. These tests use
 * pi's own Theme and pi's own width measurement so that cannot pass unnoticed.
 */

const THEME_COLORS: ThemeColor[] = [
  "accent",
  "border",
  "borderAccent",
  "borderMuted",
  "success",
  "error",
  "warning",
  "muted",
  "dim",
  "text",
  "thinkingText",
  "userMessageText",
  "customMessageText",
  "customMessageLabel",
  "toolTitle",
  "toolOutput",
  "mdHeading",
  "mdLink",
  "mdLinkUrl",
  "mdCode",
  "mdCodeBlock",
  "mdCodeBlockBorder",
  "mdQuote",
  "mdQuoteBorder",
  "mdHr",
  "mdListBullet",
  "toolDiffAdded",
  "toolDiffRemoved",
  "toolDiffContext",
  "syntaxComment",
  "syntaxKeyword",
  "syntaxFunction",
  "syntaxVariable",
  "syntaxString",
  "syntaxNumber",
  "syntaxType",
  "syntaxOperator",
  "syntaxPunctuation",
  "thinkingOff",
  "thinkingMinimal",
  "thinkingLow",
  "thinkingMedium",
  "thinkingHigh",
  "thinkingXhigh",
  "thinkingMax",
  "bashMode",
];

const THEME_BGS = [
  "selectedBg",
  "userMessageBg",
  "customMessageBg",
  "toolPendingBg",
  "toolSuccessBg",
  "toolErrorBg",
] as const;

function realTheme(): Theme {
  const fg = Object.fromEntries(THEME_COLORS.map((name) => [name, "#8abeb7"]));
  const bg = Object.fromEntries(THEME_BGS.map((name) => [name, "#303030"]));
  return new Theme(fg as never, bg as never, "truecolor");
}

const ESC = String.fromCharCode(0x1b);
// biome-ignore lint/suspicious/noControlCharactersInRegex: these tests exist to inspect escape sequences
const SGR_SEQUENCE = /\x1b\[[0-9;]*m/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: these tests exist to inspect escape sequences
const ESCAPE_START = /\x1b\[/g;
const stripColour = (text: string): string => text.replaceAll(SGR_SEQUENCE, "");

const todo = (content: string, status: TodoItem["status"]): TodoItem => ({
  id: `id-${content}`,
  content,
  status,
  priority: "high",
});

const sample: TodoItem[] = [
  todo("wire the overlay widget into the editor frame", "completed"),
  todo("add the regression test for theme invalidation", "in_progress"),
  todo("document the context cost in the readme", "pending"),
];

describe("themed overlay with a real Theme", () => {
  it("emits real escape sequences", () => {
    const lines = renderOverlayLines(sample, realTheme(), 80);
    expect(lines.join("")).toContain(ESC);
  });

  it("never exceeds the width it was given, at any width", () => {
    const theme = realTheme();
    for (let width = 4; width <= 120; width++) {
      const lines = renderOverlayLines(sample, theme, width);
      for (const line of lines) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });

  it("keeps the visible text readable once colour is stripped", () => {
    const lines = renderOverlayLines(sample, realTheme(), 80);
    const visible = stripColour(lines.join("\n"));
    expect(visible).toContain("Updated Plan");
    expect(visible).toContain("└ [✓] wire the overlay widget into the editor frame");
    expect(visible).toContain("  [•] add the regression test for theme invalidation");
    expect(visible).toContain("  [ ] document the context cost in the readme");
  });

  it("closes every escape sequence it opens, even when truncating", () => {
    // A line cut inside an escape sequence would leave a dangling prefix that
    // bleeds colour into the rest of the terminal frame.
    const theme = realTheme();
    for (let width = 4; width <= 60; width++) {
      for (const line of renderOverlayLines(sample, theme, width)) {
        const opens = line.match(ESCAPE_START)?.length ?? 0;
        const complete = line.match(SGR_SEQUENCE)?.length ?? 0;
        expect(complete).toBe(opens);
      }
    }
  });

  it("honours the line budget with a real theme", () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      todo(`task number ${i}`, i === 39 ? "in_progress" : "pending"),
    );
    const lines = renderOverlayLines(many, realTheme(), 70);
    expect(lines.length).toBeLessThanOrEqual(10);
  });

  it("matches the plain renderer once colour is removed", () => {
    // TUI and RPC hosts should show the same plan, not two different layouts.
    const themed = renderOverlayLines(sample, realTheme(), 200)
      .map(stripColour)
      .filter((line) => line.length > 0);
    const plain = renderOverlayPlainLines(sample).filter((line) => line.length > 0);
    expect(themed).toEqual(plain);
  });
});
