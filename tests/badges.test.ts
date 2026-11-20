import assert from "node:assert/strict";
import test from "node:test";
import { BADGE_CATEGORIES, buildBoard } from "../src/features/badges/catalog";

test("every category has five tiers that rise, with unique names", () => {
  const names = new Set<string>();
  for (const c of BADGE_CATEGORIES) {
    assert.equal(c.tiers.length, 5, c.key);
    for (let i = 1; i < 5; i++) assert.ok(c.tiers[i].need > c.tiers[i - 1].need, `${c.key} tier ${i + 1} needs more than tier ${i}`);
    for (const t of c.tiers) { assert.ok(!names.has(t.name), `duplicate tier name ${t.name}`); names.add(t.name); }
  }
  assert.equal(BADGE_CATEGORIES.length, 15);
});

test("buildBoard: at, below and above each threshold", () => {
  for (const c of BADGE_CATEGORIES) {
    for (let i = 0; i < 5; i++) {
      const need = c.tiers[i].need;
      assert.equal(buildBoard({ [c.key]: need - 1 }).categories.find((x) => x.key === c.key)!.level, i, `${c.key} just below tier ${i + 1}`);
      assert.equal(buildBoard({ [c.key]: need }).categories.find((x) => x.key === c.key)!.level, i + 1, `${c.key} exactly tier ${i + 1}`);
    }
    assert.equal(buildBoard({ [c.key]: c.tiers[4].need * 10 }).categories.find((x) => x.key === c.key)!.next, null, "maxed has no next tier");
  }
});

test("buildBoard: progress, remaining, empty and odd counts", () => {
  const b = buildBoard({ "deal-hunter": 3, "community-voice": -4, "deal-impact": 12.9 });
  const hunter = b.categories.find((c) => c.key === "deal-hunter")!;
  assert.equal(hunter.level, 1);
  assert.equal(hunter.next!.name, "Price Tracker");
  assert.equal(hunter.next!.remaining, 2);
  assert.equal(hunter.progress, 0.5, "2 of the 4 between tier 1 (1) and tier 2 (5)");
  assert.equal(b.categories.find((c) => c.key === "community-voice")!.value, 0, "negative treated as zero");
  assert.equal(b.categories.find((c) => c.key === "deal-impact")!.value, 12, "fractions rounded down");
  assert.equal(buildBoard({}).earned, 0);
  assert.equal(buildBoard({}).total, 75);
});

test("topBadges: highest tier per category, strongest first, names only", async () => {
  const { topBadges } = await import("../src/features/badges/catalog");
  const board = buildBoard({ "deal-hunter": 20, "community-voice": 600, "growing-followers": 5, "loyalty-journey": 40 });
  const { top, total } = topBadges(board, 3);
  assert.deepEqual(top.map((b) => b.name), ["Silver Tongue", "Deal Sniper", "Noticed"], "level 4, level 3, then level 1 in catalogue order (followers before loyalty)");
  assert.equal(top[0].name, "Silver Tongue", "level 4 first");
  assert.equal(top[1].name, "Deal Sniper", "then level 3");
  assert.equal(top.length, 3);
  assert.equal(total, board.earned);
  assert.ok(!("value" in top[0]), "counts are not part of the public data");
  assert.equal(topBadges(buildBoard({})).top.length, 0, "nothing unlocked, nothing shown");
});
