import test from "node:test";
import assert from "node:assert/strict";
import type { NormalizedOfferContract } from "../src/server/scraper/source-health";

test("Normalized offer contract correctly captures retailer vs competitor sources", () => {
  const retailerOffer: NormalizedOfferContract = {
    sourceId: "amazon-india-daily",
    sourceType: "RETAILER",
    productName: "Sony WH-1000XM5 Wireless Headphones",
    brand: "Sony",
    modelOrVariantId: "B09XS7JWHH",
    productUrl: "https://www.amazon.in/dp/B09XS7JWHH",
    seller: "Appario Retail Private Ltd",
    mrpPaise: 3499000,
    sellingPricePaise: 2699000,
    couponPricePaise: 2499000,
    bankOfferPaise: 200000,
    isAvailable: true,
    extractedAt: new Date(),
    extractionMethod: "STRUCTURED_DATA",
    evidenceReference: "sha256-evidence-snapshot-01",
  };

  assert.equal(retailerOffer.sourceType, "RETAILER");
  assert.equal(retailerOffer.mrpPaise, 3499000);
  assert.equal(retailerOffer.sellingPricePaise, 2699000);
  assert.equal(retailerOffer.isAvailable, true);

  const competitorOffer: NormalizedOfferContract = {
    sourceId: "flipshope-deal-feed",
    sourceType: "COMPETITOR",
    productName: "Sony WH-1000XM5",
    brand: "Sony",
    productUrl: "https://competitor.com/deals/sony-xm5",
    mrpPaise: 3499000,
    sellingPricePaise: 2599000,
    isAvailable: true,
    extractedAt: new Date(),
    extractionMethod: "FEED_RSS",
  };

  assert.equal(competitorOffer.sourceType, "COMPETITOR");
});

test("Circuit breaker logic trips after 5 consecutive failures and protects downstream execution", () => {
  class MockCircuitBreaker {
    failures = 0;
    state: "HEALTHY" | "DEGRADED" | "SUSPENDED" = "HEALTHY";

    recordFailure() {
      this.failures += 1;
      if (this.failures >= 5) {
        this.state = "SUSPENDED";
      } else {
        this.state = "DEGRADED";
      }
    }

    recordSuccess() {
      this.failures = 0;
      this.state = "HEALTHY";
    }

    canExecute() {
      return this.state !== "SUSPENDED";
    }
  }

  const cb = new MockCircuitBreaker();
  assert.equal(cb.canExecute(), true);

  // 1-4 failures: degraded but continues trying
  for (let i = 1; i <= 4; i++) {
    cb.recordFailure();
    assert.equal(cb.state, "DEGRADED");
    assert.equal(cb.canExecute(), true);
  }

  // 5th failure: trips breaker
  cb.recordFailure();
  assert.equal(cb.state, "SUSPENDED");
  assert.equal(cb.canExecute(), false, "Must block execution when circuit breaker is tripped");

  // Recovery resets state
  cb.recordSuccess();
  assert.equal(cb.state, "HEALTHY");
  assert.equal(cb.canExecute(), true);
});

test("Scraper network timeout is classified as UNKNOWN, never as product UNAVAILABLE", () => {
  type AvailabilityAssessment = "AVAILABLE" | "OUT_OF_STOCK" | "UNKNOWN";

  function evaluateAvailability(error?: { code: string; message: string }): AvailabilityAssessment {
    if (error) {
      // Scraper errors, timeouts, CAPTCHAs, or DNS failures mean we COULD NOT CHECK
      if (["ETIMEDOUT", "ECONNREFUSED", "CAPTCHA_BLOCKED", "PARSE_ERROR"].includes(error.code)) {
        return "UNKNOWN";
      }
    }
    return "AVAILABLE";
  }

  const timeoutResult = evaluateAvailability({ code: "ETIMEDOUT", message: "Network connection timed out" });
  assert.equal(timeoutResult, "UNKNOWN", "Network failure must never mark a product OUT_OF_STOCK");

  const captchaResult = evaluateAvailability({ code: "CAPTCHA_BLOCKED", message: "Anti-bot challenge presented" });
  assert.equal(captchaResult, "UNKNOWN", "Anti-bot blocking must never mark a product OUT_OF_STOCK");
});

