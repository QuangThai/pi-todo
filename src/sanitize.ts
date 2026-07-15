/** Strip ANSI and control characters; collapse whitespace to a single line. */
export function sanitizeTodoText(text: string): string {
  return text
    .replace(/\u001b\[[0-9;]*m/g, "")
    .replace(/[\r\n]+/g, " ")
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
