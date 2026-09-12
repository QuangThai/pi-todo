/** ANSI SGR sequences — stripped so tool input cannot colour the overlay. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is the point of this module
const ANSI_SGR = /\x1b\[[0-9;]*m/g;
/** C0/C1 control characters, including the bare ESC left by other sequences. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is the point of this module
const CONTROL_CHARS = /[\x00-\x1f\x7f-\x9f]/g;

/**
 * Bidi overrides and zero-width characters. These let stored content render in
 * the overlay as something other than what was saved, and carry no meaning in a
 * task title. Built from codepoints so this source file stays pure ASCII.
 */
const INVISIBLE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x200b, 0x200f], // zero-width space .. right-to-left mark
  [0x202a, 0x202e], // bidi embeddings and overrides
  [0x2066, 0x2069], // bidi isolates
  [0xfeff, 0xfeff], // zero-width no-break space (BOM)
];
const hex = (code: number): string => `\\u${code.toString(16).padStart(4, "0")}`;
const INVISIBLE_CHARS = new RegExp(
  `[${INVISIBLE_RANGES.map(([lo, hi]) => `${hex(lo)}-${hex(hi)}`).join("")}]`,
  "g",
);

/** Strip ANSI, control, and bidi/zero-width characters; collapse whitespace to a single line. */
export function sanitizeTodoText(text: string): string {
  return text
    .replace(ANSI_SGR, "")
    .replace(/[\r\n]+/g, " ")
    .replace(CONTROL_CHARS, " ")
    .replace(INVISIBLE_CHARS, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Clamp to `max` characters (ellipsis included) without splitting a surrogate
 * pair — slicing between a high and low surrogate leaves a lone surrogate that
 * renders as a replacement glyph and breaks JSON round-trips.
 */
export function clampTodoText(text: string, max: number): string {
  if (text.length <= max) return text;
  let cut = max - 1;
  const lastKept = text.charCodeAt(cut - 1);
  if (lastKept >= 0xd800 && lastKept <= 0xdbff) cut -= 1;
  return `${text.slice(0, cut)}…`;
}
