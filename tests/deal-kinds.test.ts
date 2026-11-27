import test from "node:test";
import assert from "node:assert/strict";
import { dealInputSchema, hasFixedPrice } from "../src/features/deals/validation";
import { buildShareMessage } from "../src/features/deals/share-card/message";

const base = { slug: "x-deal", title: "Delhi to Mumbai flights", brand: "", description: "Cheap fares", categoryId: "c", merchantId: "m", mediaId: "i", currency: "INR" as const, rating: null, reviewCount: null, ratingSource: null, productUrl: "https://www.example.com/flights", affiliateUrl: null, status: "DRAFT" as const, publishedAt: null, startsAt: null, expiresAt: null, featured: false, trending: false, options: [] };
const ok = (v: object) => dealInputSchema.safeParse({ ...base, ...v });

test("a product still needs an MRP and a price at or below it", () => {
  assert.equal(ok({ mrpMinor: 0, priceMinor: 0 }).success, false);
  assert.equal(ok({ mrpMinor: 100_00, priceMinor: 120_00 }).success, false);
  assert.equal(ok({ mrpMinor: 100_00, priceMinor: 80_00 }).success, true);
});

test("travel and sale-page deals need a headline but no MRP or price", () => {
  for (const kind of ["TRAVEL", "SALE_PAGE"]) {
    assert.equal(ok({ kind, mrpMinor: 0, priceMinor: 0 }).success, false, "headline required");
    assert.equal(ok({ kind, mrpMinor: 0, priceMinor: 0, headline: "Up to 80% off" }).success, true);
  }
  assert.equal(ok({ kind: "TRAVEL", mrpMinor: 0, priceMinor: 249_900, headline: "Flights from Rs 2,499" }).success, true, "a from-price is allowed");
  assert.equal(ok({ kind: "SALE", mrpMinor: 0, priceMinor: 0, headline: "x" }).success, false, "unknown kind");
});

test("hasFixedPrice is true for products and for older rows without a kind", () => {
  assert.equal(hasFixedPrice({}), true);
  assert.equal(hasFixedPrice({ kind: "PRODUCT" }), true);
  assert.equal(hasFixedPrice({ kind: "TRAVEL" }), false);
});

test("the share message shows the headline instead of a price", () => {
  const links = { social: [] };
  const deal = { slug: "s", title: "t", priceMinor: 0, mrpMinor: 0, storeName: null, couponCode: null, bankOffers: [], images: [], expired: false };
  const text = buildShareMessage({ ...deal, headline: "Up to 80% off clothing" }, "https://metadeals4u.in/d/abc", { links });
  assert.match(text, /^Up to 80% off clothing\nView Deal:\nhttps:\/\/metadeals4u\.in\/d\/abc/);
  assert.match(buildShareMessage({ ...deal, priceMinor: 99900 }, "https://x/y", { links }), /Deal Price: Rs\. .*\nBuy Now:/);
});
