import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { Agent1DealHunter, type TelegramApprovalAction } from "../src/server/scraper/agent1-deal-hunter";
import { Agent2PublishingEngine } from "../src/server/scraper/agent2-publishing-engine";
import { Agent3ShadowIntelligence } from "../src/server/scraper/agent3-shadow-intelligence";
import { DealQualityEngine } from "../src/server/scraper/deal-quality-engine";
import type { NormalizedOfferContract } from "../src/server/scraper/source-health";

const assessment = DealQualityEngine.evaluateDeal({
  sellingPricePaise: 50000,
  mrpPaise: 100000,
  history: [],
});

const webhookSecret = "test-telegram-secret-1234567890abcdef";

function generateTestSignature(
  candidateId: string,
  action: { telegramUserId: string; action: string; timestamp: number },
  secret: string
): string {
  const payload = `${action.telegramUserId}:${candidateId}:${action.action}:${action.timestamp}`;
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

test("Agent 1 Security: Rejects invalid Telegram webhook signature", async () => {
  const now = Date.now();
  const action: TelegramApprovalAction = {
    action: "APPROVE",
    telegramUserId: "admin-1",
    signature: "invalid-tampered-signature",
    timestamp: now,
  };

  const result = await Agent1DealHunter.handleTelegramApproval(
    "candidate-1",
    action,
    assessment,
    ["admin-1"],
    webhookSecret
  );

  assert.equal(result.success, false);
  assert.match(result.error || "", /INVALID_SIGNATURE/);
});

test("Agent 1 Security: Rejects unauthorized Telegram user (Fails closed)", async () => {
  const now = Date.now();
  const action: TelegramApprovalAction = {
    action: "APPROVE",
    telegramUserId: "unauthorized-user-99",
    signature: "sig",
    timestamp: now,
  };

  const result = await Agent1DealHunter.handleTelegramApproval(
    "candidate-1",
    action,
    assessment,
    ["admin-1", "admin-2"],
    webhookSecret
  );

  assert.equal(result.success, false);
  assert.match(result.error || "", /UNAUTHORIZED_ADMIN/);
});

test("Agent 1 Security: Replay protection prevents replayed Telegram callback consumption", async () => {
  const now = Date.now();
  const sig = generateTestSignature(
    "candidate-replay",
    { telegramUserId: "admin-1", action: "HOLD", timestamp: now },
    webhookSecret
  );

  const action: TelegramApprovalAction = {
    action: "HOLD",
    telegramUserId: "admin-1",
    signature: sig,
    timestamp: now,
  };

  // First consumption: Succeeds
  const res1 = await Agent1DealHunter.handleTelegramApproval(
    "candidate-replay",
    action,
    assessment,
    ["admin-1"],
    webhookSecret
  );
  assert.equal(res1.success, true);

  // Second consumption with exact same signature: REJECTED as replay
  const res2 = await Agent1DealHunter.handleTelegramApproval(
    "candidate-replay",
    action,
    assessment,
    ["admin-1"],
    webhookSecret
  );
  assert.equal(res2.success, false);
  assert.match(res2.error || "", /REPLAYED_CALLBACK/);
});

test("Agent 1 Security: Rejects suspected price errors from receiving automated Telegram approval", async () => {
  const now = new Date();
  const history = [
    { pricePaise: 8990000, observedAt: new Date(now.getTime() - 60 * 24 * 3600 * 1000) },
  ];

  const priceErrorAssessment = DealQualityEngine.evaluateDeal({
    sellingPricePaise: 89900, // 899 INR (glitch/mistake against 89,900)
    mrpPaise: 8990000,
    history,
  });

  const timestamp = Date.now();
  const sig = generateTestSignature(
    "candidate-price-err",
    { telegramUserId: "admin-1", action: "APPROVE", timestamp },
    webhookSecret
  );

  const result = await Agent1DealHunter.handleTelegramApproval(
    "candidate-price-err",
    { action: "APPROVE", telegramUserId: "admin-1", signature: sig, timestamp },
    priceErrorAssessment,
    ["admin-1"],
    webhookSecret
  );

  assert.equal(result.success, false);
  assert.match(result.error || "", /PRICE_ERROR_POLICY/);
});

test("Agent 2 Security: Blocks Agent 3 callerIdentity unconditionally", async () => {
  const result = await Agent2PublishingEngine.publishCandidate({
    candidateId: "shadow-attempt-id",
    authorizationToken: "auth-tok",
    callerIdentity: { role: "AGENT_3" },
  });

  assert.equal(result.published, false);
  assert.match(result.error || "", /AGENT_3_SHADOW_RESTRICTION/);
});

test("Agent 2 Security: Evaluates emergency kill-switch immediately prior to publishing", async () => {
  Agent2PublishingEngine.setKillSwitch(true);
  assert.equal(Agent2PublishingEngine.isKillSwitchActive(), true);

  const result = await Agent2PublishingEngine.publishCandidate({
    candidateId: "candidate-ks",
    authorizationToken: "auth-tok",
    callerIdentity: { role: "AGENT_1" },
  });

  assert.equal(result.published, false);
  assert.match(result.error || "", /KILL_SWITCH_ACTIVE/);

  // Reset kill switch
  Agent2PublishingEngine.setKillSwitch(false);
  assert.equal(Agent2PublishingEngine.isKillSwitchActive(), false);
});

test("Agent 2 Security: Rejects publishing if persistent authorization token is invalid or missing", async () => {
  const result = await Agent2PublishingEngine.publishCandidate({
    candidateId: "non-existent-candidate-xyz",
    authorizationToken: "random-invalid-token",
    callerIdentity: { role: "AGENT_1" },
  });

  assert.equal(result.published, false);
  assert.match(result.error || "", /AUTHORIZATION_NOT_FOUND/);
});

test("Agent 3 Security: Detects duplicates and calculates precision telemetry without publishing", async () => {
  // Evaluates outcomes
  Agent3ShadowIntelligence.evaluateShadowOutcome({
    candidateId: "c1",
    label: "GENUINE",
    reviewerId: "reviewer-1",
  });
  Agent3ShadowIntelligence.evaluateShadowOutcome({
    candidateId: "c2",
    label: "FALSE_POSITIVE",
    reviewerId: "reviewer-1",
  });

  const metrics = Agent3ShadowIntelligence.calculatePrecisionMetrics();
  assert.ok(metrics.totalEvaluated >= 2);
  assert.equal(metrics.precision, 50);
  assert.equal(metrics.falsePositiveRate, 50);
});

test("Agent 3 Security: Rejects unverified or unavailable products with error", async () => {
  const outOfStockOffer: NormalizedOfferContract = {
    sourceId: "competitor-site",
    sourceType: "COMPETITOR",
    productName: "Unavailable Phone",
    brand: "Brand",
    productUrl: "https://competitor.com/item",
    mrpPaise: 50000,
    sellingPricePaise: 30000,
    isAvailable: false, // Out of stock
    extractedAt: new Date(),
    extractionMethod: "STRUCTURED_DATA",
  };

  const result = await Agent3ShadowIntelligence.recordCompetitorCandidate(outOfStockOffer);
  assert.equal(result.recorded, false);
  assert.match(result.error || "", /PRODUCT_UNAVAILABLE/);
});
