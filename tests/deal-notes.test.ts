import assert from "node:assert/strict";
import test from "node:test";
import { cleanNote, parseEditorNotes, EDITOR_LINES_MAX, EDITOR_LINE_MAX } from "../src/features/deals/notes";

test("cleanNote strips control characters and collapses blank lines", () => {
  assert.equal(cleanNote("  hi\u0000 there\r\n\r\n\r\n\r\nbye "), "hi there\n\nbye");
  assert.equal(cleanNote(42), "");
});

test("cleanNote keeps markup as plain text (React escapes it on render)", () => {
  assert.equal(cleanNote("<b>x</b>"), "<b>x</b>");
});

test("parseEditorNotes drops bullets and empty lines", () => {
  assert.deepEqual(parseEditorNotes("- one\n\n* two\n• three").lines, ["one", "two", "three"]);
});

test("parseEditorNotes enforces the limits", () => {
  assert.ok(parseEditorNotes(Array.from({ length: EDITOR_LINES_MAX + 1 }, (_, i) => `p${i}`).join("\n")).error);
  assert.ok(parseEditorNotes("x".repeat(EDITOR_LINE_MAX + 1)).error);
  assert.equal(parseEditorNotes("ok").error, undefined);
});
