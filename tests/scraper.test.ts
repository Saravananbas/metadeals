import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateDiscountPercent,
  evaluatePriceAnomaly,
  candidateInputSchema,
  candidateReviewActionSchema,
} from "../src/features/scraper/validation";

test("calculateDiscountPercent calculates exact rounded percentage without inflating savings", () => {
  assert.equal(calculateDiscountPercent(100000, 75000), 25);
  assert.equal(calculateDiscountPercent(99900, 57990), 42);
  assert.equal(calculateDiscountPercent(10000, 9999), 0);
  assert.equal(calculateDiscountPercent(10000, 10000), 0);
  // Negative or invalid prices return 0
  assert.equal(calculateDiscountPercent(1000, 1200), 0);
  assert.equal(calculateDiscountPercent(0, 100), 0);
  assert.equal(calculateDiscountPercent(-100, 50), 0);
});

test("evaluatePriceAnomaly detects extreme pricing glitches and median drops", () => {
  // Normal 35% discount is not an anomaly
  const normal = evaluatePriceAnomaly(65000, 100000, 70000);
  assert.equal(normal.isAnomaly, false);
  assert.equal(normal.severity, "NONE");

  // Extreme discount 89% triggers anomaly
  const extreme = evaluatePriceAnomaly(11000, 100000);
  assert.equal(extreme.isAnomaly, true);
  assert.equal(extreme.severity, "HIGH");
  assert.match(extreme.reason ?? "", /exceeds 85% threshold/);

  // 95% discount triggers critical glitch
  const critical = evaluatePriceAnomaly(5000, 100000);
  assert.equal(critical.isAnomaly, true);
  assert.equal(critical.severity, "CRITICAL");

  // Price dropped 75% below 30-day median
  const medianDrop = evaluatePriceAnomaly(25000, 50000, 100000);
  assert.equal(medianDrop.isAnomaly, true);
  assert.match(medianDrop.reason ?? "", /30-day median/);
});

test("candidateInputSchema validates discovery attributes and prevents price > MRP", () => {
  const valid = candidateInputSchema.safeParse({
    sourceUrl: "https://www.tatacliq.com/sony-tv/p-12345",
    sourcePlatform: "cuelinks",
    externalId: "SONY-TV-55",
    rawTitle: "Sony Bravia 55 inch 4K Ultra HD Smart TV",
    brand: "Sony",
    categorySlug: "appliances",
    observedPriceMinor: 5799000,
    observedMrpMinor: 9990000,
    sellerName: "Tata CLiQ Official",
  });
  assert.equal(valid.success, true);
  if (valid.success) {
    assert.equal(valid.data.currency, "INR");
    assert.equal(valid.data.inStock, true);
  }

  // Reject invalid price where selling price > MRP
  const invalidPrice = candidateInputSchema.safeParse({
    sourceUrl: "https://www.tatacliq.com/sony-tv/p-12345",
    sourcePlatform: "cuelinks",
    rawTitle: "Sony Bravia 55 inch 4K Ultra HD Smart TV",
    categorySlug: "appliances",
    observedPriceMinor: 1200000,
    observedMrpMinor: 1000000,
  });
  assert.equal(invalidPrice.success, false);

  // Reject non-URL
  const invalidUrl = candidateInputSchema.safeParse({
    sourceUrl: "ftp://invalid-url.com",
    sourcePlatform: "cuelinks",
    rawTitle: "Sony Bravia TV",
    categorySlug: "appliances",
    observedPriceMinor: 500000,
    observedMrpMinor: 1000000,
  });
  assert.equal(invalidUrl.success, false);
});

test("candidateReviewActionSchema validates admin approval and rejection", () => {
  const approve = candidateReviewActionSchema.safeParse({ action: "APPROVE" });
  assert.equal(approve.success, true);

  const reject = candidateReviewActionSchema.safeParse({
    action: "REJECT",
    reason: "Discontinued model with unverified seller",
  });
  assert.equal(reject.success, true);

  const invalid = candidateReviewActionSchema.safeParse({ action: "MAYBE" });
  assert.equal(invalid.success, false);
});
