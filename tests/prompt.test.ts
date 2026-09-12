import { describe, expect, it } from "vitest";
import {
  TODOREAD_DESCRIPTION,
  TODOUPDATE_DESCRIPTION,
  TODOWRITE_DESCRIPTION,
  TODOWRITE_GUIDELINES,
} from "../src/prompt.js";

/** Everything pi puts in the system prompt / tool schemas on every request. */
const ALWAYS_ON = [
  TODOWRITE_DESCRIPTION,
  TODOUPDATE_DESCRIPTION,
  TODOREAD_DESCRIPTION,
  ...TODOWRITE_GUIDELINES,
].join("\n");

const approxTokens = (text: string): number => Math.round(text.length / 4);

describe("prompt guidance", () => {
  it("documents the rules the tools actually enforce", () => {
    expect(TODOWRITE_DESCRIPTION).toMatch(/REPLACES the entire list/);
    expect(TODOWRITE_DESCRIPTION).toMatch(/one item in_progress/);
    expect(TODOWRITE_DESCRIPTION).toMatch(/omit `id` for a new item/);
    expect(TODOWRITE_DESCRIPTION).toMatch(/recovered as a new item/);
    expect(TODOUPDATE_DESCRIPTION).toMatch(/cannot delete items/);
    expect(TODOREAD_DESCRIPTION).toMatch(/stable ids/);
  });

  it("suggests rather than commands, so single-step work is not forced into a list", () => {
    expect(TODOWRITE_DESCRIPTION).toMatch(/Skip it for a single step/);
    expect(ALWAYS_ON).not.toMatch(/\balways (create|call|use)\b/i);
  });

  it("names a tool in every guideline bullet", () => {
    // pi appends these flat into the Guidelines section with no tool prefix, so
    // "this tool" would be ambiguous to the model.
    for (const guideline of TODOWRITE_GUIDELINES) {
      expect(guideline).toMatch(/todo_(write|update|read)/);
    }
  });

  it("no longer spends tokens warning about parallel batches", () => {
    // Every mutation runs inside withStoreLock, so a batched read or update sees
    // a consistent list rather than a torn one, and a patch built from guessed
    // IDs fails with an error that names the current IDs. The failure mode is
    // self-correcting, which does not justify ~40 tokens on every request.
    expect(ALWAYS_ON).not.toMatch(/parallel batch/i);
  });

  it("keeps the always-on prompt payload within budget", () => {
    // These strings ship on every single request. The regression this guards is
    // real: the previous revision spent ~1.75k tokens per request on tool prose,
    // largely by restating the ID rule in four places.
    expect(approxTokens(ALWAYS_ON)).toBeLessThan(600);
  });

  it("states each rule once rather than restating it across surfaces", () => {
    // A guideline bullet copied verbatim out of the description is the exact
    // duplication that inflated the payload before.
    const descriptionSentences = new Set(
      TODOWRITE_DESCRIPTION.split(/(?<=[.!])\s+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    );
    for (const guideline of TODOWRITE_GUIDELINES) {
      expect(descriptionSentences.has(guideline.trim().toLowerCase())).toBe(false);
    }
  });
});
