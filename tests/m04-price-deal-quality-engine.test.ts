import test from "node:test";
import assert from "node:assert/strict";
import { DealQualityEngine } from "../src/server/scraper/deal-quality-engine";

test("Quality Engine evaluates genuine exceptional deal with high authenticity and attractiveness", () => {
  const now = new Date();
  const history = [
    { pricePaise: 4999900, observedAt: new Date(now.getTime() - 80 * 24 * 3600 * 1000) },
    { pricePaise: 4899900, observedAt: new Date(now.getTime() - 40 * 24 * 3600 * 1000) },
    { pricePaise: 4799900, observedAt: new Date(now.getTime() - 10 * 24 * 3600 * 1000) },
  ];

  const assessment = DealQualityEngine.evaluateDeal({
    sellingPricePaise: 3899900, // ~19% below lowest 90d price
    mrpPaise: 5499900,
    history,
    sellerRating: 4.5,
    isSellerVerified: true,
    isVariantMatched: true,
    isStockConfirmed: true,
    isCouponVerified: true,
  });

  assert.equal(assessment.version, "1.0.0");
  assert.equal(assessment.isPriceErrorSuspected, false);
  assert.equal(assessment.classification, "GENUINE_EXCEPTIONAL_PRICE");
  assert.ok(assessment.authenticityScore >= 80, `Authenticity score should be >= 80, got ${assessment.authenticityScore}`);
  assert.ok(assessment.attractivenessScore >= 70, `Attractiveness score should be >= 70, got ${assessment.attractivenessScore}`);
  assert.ok(assessment.commercialPriority > 0);
});

test("Quality Engine flags suspected price error when price collapses by >80% without precedent", () => {
  const now = new Date();
  const history = [
    { pricePaise: 8990000, observedAt: new Date(now.getTime() - 60 * 24 * 3600 * 1000) }, // 89,900 INR
    { pricePaise: 8790000, observedAt: new Date(now.getTime() - 30 * 24 * 3600 * 1000) },
    { pricePaise: 8850000, observedAt: new Date(now.getTime() - 5 * 24 * 3600 * 1000) },
  ];

  const assessment = DealQualityEngine.evaluateDeal({
    sellingPricePaise: 89900, // 899 INR (glitch/mistake!)
    mrpPaise: 8990000,
    history,
  });

  assert.equal(assessment.isPriceErrorSuspected, true, "Severe price drop must be flagged as suspected price error");
  assert.equal(assessment.classification, "SUSPECTED_PRICE_ERROR");
});

test("Calculates rolling window statistics correctly for 30/90/180/365 days", () => {
  const now = new Date();
  const observations = [
    { pricePaise: 100000, observedAt: new Date(now.getTime() - 200 * 24 * 3600 * 1000) },
    { pricePaise: 80000, observedAt: new Date(now.getTime() - 50 * 24 * 3600 * 1000) },
    { pricePaise: 70000, observedAt: new Date(now.getTime() - 20 * 24 * 3600 * 1000) },
    { pricePaise: 60000, observedAt: new Date(now.getTime() - 2 * 24 * 3600 * 1000) },
  ];

  const stats90d = DealQualityEngine.calculateWindowStats(observations, 90, now);
  assert.equal(stats90d.observationCount, 3);
  assert.equal(stats90d.minPaise, 60000);
  assert.equal(stats90d.maxPaise, 80000);
  assert.equal(stats90d.medianPaise, 70000);
  assert.equal(stats90d.hasSufficientCoverage, true);

  const stats30d = DealQualityEngine.calculateWindowStats(observations, 30, now);
  assert.equal(stats30d.observationCount, 2);
  assert.equal(stats30d.hasSufficientCoverage, false, "2 observations is not sufficient 30d coverage");
});

