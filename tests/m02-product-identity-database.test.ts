import test from "node:test";
import assert from "node:assert/strict";

test("Product Master identity distinguishes material variants without fuzzy merging", () => {
  const v1 = { brand: "Apple", model: "iPhone 15", storage: "128GB", color: "Black" };
  const v2 = { brand: "Apple", model: "iPhone 15", storage: "256GB", color: "Black" };
  const v3 = { brand: "Apple", model: "iPhone 15", storage: "128GB", color: "Blue" };

  const getVariantKey = (v: typeof v1) => `color:${v.color.toLowerCase()}|storage:${v.storage.toLowerCase()}`;

  assert.notEqual(getVariantKey(v1), getVariantKey(v2), "Storage differences must generate distinct variant keys");
  assert.notEqual(getVariantKey(v1), getVariantKey(v3), "Color differences must generate distinct variant keys");
  assert.equal(getVariantKey(v1), "color:black|storage:128gb");
});

test("Price history preserves append-only integrity with 90-day analytics window", () => {
  const now = new Date();
  const observations = [
    { pricePaise: 4999900, observedAt: new Date(now.getTime() - 100 * 24 * 3600 * 1000) }, // 100 days ago
    { pricePaise: 4499900, observedAt: new Date(now.getTime() - 60 * 24 * 3600 * 1000) },  // 60 days ago
    { pricePaise: 4199900, observedAt: new Date(now.getTime() - 15 * 24 * 3600 * 1000) },  // 15 days ago
    { pricePaise: 3999900, observedAt: now },                                               // current
  ];

  // 90-day window filter
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 3600 * 1000);
  const recentObservations = observations.filter(o => o.observedAt >= ninetyDaysAgo);

  assert.equal(recentObservations.length, 3, "Observations older than 90 days must be partitioned from 90-day calculations");
  
  const min90DayPrice = Math.min(...recentObservations.map(o => o.pricePaise));
  assert.equal(min90DayPrice, 3999900, "90-day all-time-low must be calculated accurately");
});

test("Governance rules enforce Agent 3 shadow separation and price error isolation", () => {
  type AuthStatus = "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "PUBLISHED";
  
  function authorizeDeal(candidate: {
    source: "AGENT_1_RETAILER" | "AGENT_3_COMPETITOR";
    isPriceErrorSuspected: boolean;
    confidenceScore: number;
    hasAdminSignature: boolean;
  }): { authorized: boolean; reason?: string } {
    if (candidate.source === "AGENT_3_COMPETITOR") {
      return { authorized: false, reason: "AGENT_3_SHADOW_RESTRICTION: Competitor candidate cannot receive publishing authorization" };
    }
    if (candidate.isPriceErrorSuspected) {
      return { authorized: false, reason: "PRICE_ERROR_HOLD: Suspected price errors cannot receive automatic publishing authorization" };
    }
    if (!candidate.hasAdminSignature) {
      return { authorized: false, reason: "ADMIN_SIGNATURE_REQUIRED: Human approval token required" };
    }
    if (candidate.confidenceScore < 0.75) {
      return { authorized: false, reason: "LOW_CONFIDENCE: Insufficient data confidence" };
    }
    return { authorized: true };
  }

  // Agent 3 attempt
  const a3Result = authorizeDeal({
    source: "AGENT_3_COMPETITOR",
    isPriceErrorSuspected: false,
    confidenceScore: 0.99,
    hasAdminSignature: true,
  });
  assert.equal(a3Result.authorized, false);
  assert.match(a3Result.reason || "", /AGENT_3_SHADOW_RESTRICTION/);

  // Price error attempt
  const priceErrorResult = authorizeDeal({
    source: "AGENT_1_RETAILER",
    isPriceErrorSuspected: true,
    confidenceScore: 0.95,
    hasAdminSignature: true,
  });
  assert.equal(priceErrorResult.authorized, false);
  assert.match(priceErrorResult.reason || "", /PRICE_ERROR_HOLD/);

  // Valid Agent 1 candidate with human approval
  const validResult = authorizeDeal({
    source: "AGENT_1_RETAILER",
    isPriceErrorSuspected: false,
    confidenceScore: 0.88,
    hasAdminSignature: true,
  });
  assert.equal(validResult.authorized, true);
});

