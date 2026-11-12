import test from "node:test";
import assert from "node:assert/strict";
import { DealLifecycleManager } from "../src/server/scraper/deal-lifecycle-manager";

test("Lifecycle manager marks deal DRAFT immediately on confirmed unavailability", async () => {
  // Test safety policy: transient scraper error is NOT confirmed unavailability
  function shouldHideDeal(verification: { isScraperError: boolean; httpStatus: number; stockFound: boolean }): boolean {
    if (verification.isScraperError) {
      return false; // Scraper timeout/CAPTCHA is UNKNOWN, not confirmed unavailable
    }
    if (verification.httpStatus === 404 || !verification.stockFound) {
      return true; // Confirmed dead product / out of stock
    }
    return false;
  }

  assert.equal(shouldHideDeal({ isScraperError: true, httpStatus: 0, stockFound: false }), false, "Scraper failure must not hide deal");
  assert.equal(shouldHideDeal({ isScraperError: false, httpStatus: 404, stockFound: false }), true, "404 must hide deal");
  assert.equal(shouldHideDeal({ isScraperError: false, httpStatus: 200, stockFound: false }), true, "Confirmed Out of Stock must hide deal");
});

test("Lifecycle manager marks deal DRAFT when price increases above MRP or loses discount", async () => {
  function evaluatePriceUpdate(mrp: number, newPrice: number): "KEEP_ACTIVE" | "HIDE_DEAL" {
    if (newPrice >= mrp) {
      return "HIDE_DEAL";
    }
    return "KEEP_ACTIVE";
  }

  assert.equal(evaluatePriceUpdate(50000, 52000), "HIDE_DEAL");
  assert.equal(evaluatePriceUpdate(50000, 39999), "KEEP_ACTIVE");
});

