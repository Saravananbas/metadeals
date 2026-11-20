/** Rules for the text people write on a deal page. Pure functions so the website, the apps and the tests share them. */
export const NOTE_MAX = 500;
export const EDITOR_LINES_MAX = 12;
export const EDITOR_LINE_MAX = 200;

/** Plain text only: tags are never rendered (React escapes them), control characters and runs of blank lines are removed. */
export function cleanNote(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Editor's Notes: one point per line. Empty lines are dropped; too many or too long lines are an error the admin must fix. */
export function parseEditorNotes(raw: unknown): { lines: string[]; error?: string } {
  const lines = cleanNote(raw).split("\n").map((l) => l.replace(/^\s*[-*•]\s*/, "").trim()).filter(Boolean);
  if (lines.length > EDITOR_LINES_MAX) return { lines, error: `Use at most ${EDITOR_LINES_MAX} points.` };
  if (lines.some((l) => l.length > EDITOR_LINE_MAX)) return { lines, error: `Each point can be at most ${EDITOR_LINE_MAX} characters.` };
  return { lines };
}
