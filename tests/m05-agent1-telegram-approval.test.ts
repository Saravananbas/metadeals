import test from "node:test";
import assert from "node:assert/strict";
import { Agent1DealHunter } from "../src/server/scraper/agent1-deal-hunter";
import type { NormalizedOfferContract } from "../src/server/scraper/source-health";
import { DealQualityEngine } from "../src/server/scraper/deal-quality-engine";

test("Agent 1 correctly routes high-confidence deals to AWAITING_APPROVAL with approvalToken", async () => {
  const offer: NormalizedOfferContract = {
    sourceId: "amazon-india-crawler",
    sourceType: "RETAILER",
    productName: "LG 55 Inch 4K OLED Smart TV",
    brand: "LG",
    productUrl: "https://www.amazon.in/dp/B0CX21M98",
    mrpPaise: 14999000,
    sellingPricePaise: 8999000,
    isAvailable: true,
    extractedAt: new Date(),
    extractionMethod: "STRUCTURED_DATA",
  };

  const history = [
    { pricePaise: 11999000, observedAt: new Date(Date.now() - 60 * 24 * 3600 * 1000) },
    { pricePaise: 11499000, observedAt: new Date(Date.now() - 30 * 24 * 3600 * 1000) },
    { pricePaise: 10999000, observedAt: new Date(Date.now() - 5 * 24 * 3600 * 1000) },
  ];

  const result = await Agent1DealHunter.processDiscoveredOffer(offer, history);
  assert.equal(result.route, "AWAITING_APPROVAL");
  assert.ok(result.approvalToken, "Awaiting approval candidates must generate an approvalToken");
  assert.ok(result.assessment.authenticityScore > 75);
});

test("Agent 1 rejects Telegram approvals from unauthorized user IDs", async () => {
  const assessment = DealQualityEngine.evaluateDeal({
    sellingPricePaise: 50000,
    mrpPaise: 100000,
    history: [],
  });

  const res = await Agent1DealHunter.handleTelegramApproval(
    "candidate-123",
    {
      action: "APPROVE",
      telegramUserId: "unauthorized-hacker-id",
      signature: "sig",
      timestamp: Date.now(),
    },
    assessment,
    ["valid-admin-id-1", "valid-admin-id-2"]
  );

  assert.equal(res.success, false);
  assert.match(res.error || "", /UNAUTHORIZED_ADMIN/);
});

test("Agent 1 rejects stale Telegram callbacks older than 15 minutes", async () => {
  const assessment = DealQualityEngine.evaluateDeal({
    sellingPricePaise: 50000,
    mrpPaise: 100000,
    history: [],
  });

  const twentyMinutesAgo = Date.now() - 20 * 60 * 1000;

  const res = await Agent1DealHunter.handleTelegramApproval(
    "candidate-123",
    {
      action: "APPROVE",
      telegramUserId: "valid-admin-id-1",
      signature: "sig",
      timestamp: twentyMinutesAgo,
    },
    assessment,
    ["valid-admin-id-1"]
  );

  assert.equal(res.success, false);
  assert.match(res.error || "", /STALE_CALLBACK/);
});

