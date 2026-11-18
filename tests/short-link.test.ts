import assert from "node:assert/strict";
import test from "node:test";
import { dealShareUrl, dealShortCode, DEAL_CODE_PATTERN } from "../src/features/deals/short-link";

test("short deal link: 8-character code from a real id, full address otherwise", () => {
  const id = "cmwlfrc4i003q0v531c0gioll";
  assert.equal(dealShortCode(id), "531c0gioll".slice(-8));
  assert.equal(dealShareUrl("https://metadeals4u.in", { id, slug: "x-3c2d9d" }), `https://metadeals4u.in/d/${id.slice(-8)}`);
  assert.equal(dealShortCode("demo-iphone"), null, "demo ids are not cuids");
  assert.equal(dealShareUrl("https://metadeals4u.in", { id: "demo-iphone", slug: "apple-iphone" }), "https://metadeals4u.in/deal/apple-iphone");
  assert.ok(DEAL_CODE_PATTERN.test(dealShortCode(id)!));
  assert.ok(!DEAL_CODE_PATTERN.test("bad!code") && !DEAL_CODE_PATTERN.test("abc"));
  assert.ok(dealShareUrl("https://metadeals4u.in", { id, slug: "x" }).length < 40, "it is actually short");
});
