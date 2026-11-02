import assert from "node:assert/strict";
import test from "node:test";
import { dealInputSchema, isPublicHttpsUrl, listingSchema, minorSavings } from "../src/features/deals/validation";
const valid = { slug: "test-product", title: "Test product", brand: "Brand", description: "Description", categoryId: "category", merchantId: "merchant", mediaId: "media", mrpMinor: 10000, priceMinor: 8999, currency: "INR", rating: null, reviewCount: null, ratingSource: null, productUrl: "https://www.amazon.in/product", affiliateUrl: null, status: "DRAFT", publishedAt: null, startsAt: null, expiresAt: null, featured: false, trending: false };
test("deal inputs reject invalid prices, invented discount and unlabelled ratings", () => {
  assert.equal(dealInputSchema.safeParse(valid).success, true);
  for (const patch of [{ priceMinor: -1 }, { priceMinor: 10001 }, { priceMinor: 0.2 }, { mrpMinor: 0 }, { discountPercent: 90 }, { rating: 4.5 }, { reviewCount: 5 }, { status: "PUBLISHED" }, { currency: "USD" }]) assert.equal(dealInputSchema.safeParse({ ...valid, ...patch }).success, false);
  assert.equal(dealInputSchema.safeParse({ ...valid, rating: 4.5, ratingSource: "Merchant listing, 2 Nov 2026" }).success, true);
});
test("deal dates and purchase options must be consistent", () => {
  assert.equal(dealInputSchema.safeParse({ ...valid, startsAt: "2026-12-03T00:00:00Z", expiresAt: "2026-12-02T00:00:00Z" }).success, false);
  const option = { merchantId: "a", priceMinor: 1000, productUrl: valid.productUrl, affiliateUrl: null };
  assert.equal(dealInputSchema.safeParse({ ...valid, options: [option, option] }).success, false);
});
test("public product URLs reject non-HTTPS, credentials, private names and IP literals", () => {
  for (const url of ["javascript:alert(1)", "http://amazon.in", "https://localhost", "https://127.0.0.1/x", "https://[::1]/", "https://name:pass@amazon.in/", "https://amazon.in:444/", "https://service.internal/"]) assert.equal(isPublicHttpsUrl(url), false, url);
  assert.equal(isPublicHttpsUrl("https://www.amazon.in/a?tag=manual"), true);
});
test("integer paise discount calculations and bounded pagination", () => {
  assert.deepEqual(minorSavings(10000, 8999), { savingsMinor: 1001, discountPercent: 10 });
  assert.deepEqual(minorSavings(0, -1), { savingsMinor: 0, discountPercent: 0 });
  assert.equal(listingSchema.safeParse({ limit: 5000 }).success, false);
  assert.equal(listingSchema.safeParse({ page: -1 }).success, false);
});
