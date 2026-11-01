import assert from "node:assert/strict";
import test from "node:test";
import { getSavings } from "../src/features/deals/pricing";
import { filterDeals } from "../src/features/deals/filter";
import { demoDeals } from "../src/features/deals/demo-data";
import type { DealFilters } from "../src/features/deals/types";

const base: DealFilters = { query: "", category: "", store: "", view: "top" };

test("discount never overstates the actual saving", () => {
  assert.deepEqual(getSavings(99900, 61999), { amount: 37901, percent: 37 });
  assert.deepEqual(getSavings(12595, 6299), { amount: 6296, percent: 49 });
  assert.deepEqual(getSavings(100, 0), { amount: 100, percent: 100 });
});

test("invalid and non-discount prices cannot produce misleading badges", () => {
  for (const [original, price] of [[0, 0], [-10, 5], [10, -1], [10, 15], [100, 100], [NaN, 2], [100, Infinity]]) {
    assert.deepEqual(getSavings(original, price), { amount: 0, percent: 0 });
  }
});

test("search handles case, whitespace, brand and multiple product terms", () => {
  assert.equal(filterDeals(demoDeals, { ...base, query: "  SONY   headphones " })[0]?.id, "demo-headphones");
  assert.equal(filterDeals(demoDeals, { ...base, query: "128 apple" })[0]?.id, "demo-iphone");
  assert.equal(filterDeals(demoDeals, { ...base, query: "not-a-product" }).length, 0);
});

test("category and store constraints work together", () => {
  const result = filterDeals(demoDeals, { ...base, category: "electronics", store: "flipkart" });
  assert.deepEqual(result.map((deal) => deal.id), ["demo-watch"]);
  assert.equal(filterDeals(demoDeals, { ...base, category: "travel" }).length, 0);
});

test("featured selection and latest ordering do not mutate the source", () => {
  const ids = demoDeals.map((deal) => deal.id);
  assert.equal(filterDeals(demoDeals, { ...base, view: "featured" }).length, 4);
  assert.equal(filterDeals(demoDeals, { ...base, view: "latest" })[0].id, "demo-shoes");
  assert.deepEqual(demoDeals.map((deal) => deal.id), ids);
});
