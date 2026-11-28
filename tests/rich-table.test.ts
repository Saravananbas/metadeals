import assert from "node:assert/strict";
import test from "node:test";
import { htmlToText, sanitizeRichHtml } from "../src/server/community/richtext";

const table = '<table style="width:100%" class="x"><tbody><tr><th colspan="1" rowspan="1" style="color:red">Screen Size</th><td colspan="1" rowspan="1" onclick="x()">85 Inches</td></tr><tr><th>Brand</th><td>PHILIPS</td></tr></tbody></table>';

test("pasted spec tables survive sanitizing as tables, without styles, classes or event attributes", () => {
  const html = sanitizeRichHtml(table);
  assert.match(html, /^<table><tbody><tr><th colspan="1" rowspan="1">Screen Size<\/th><td colspan="1" rowspan="1">85 Inches<\/td><\/tr>/);
  assert.doesNotMatch(html, /style|class|onclick/);
  assert.equal(sanitizeRichHtml('<table><tr><td><script>alert(1)</script>ok</td></tr></table>').includes("script"), false);
});

test("table text keeps cells apart (plain text for search and meta)", () => {
  assert.equal(htmlToText(sanitizeRichHtml(table)), "Screen Size 85 Inches\nBrand PHILIPS");
});
