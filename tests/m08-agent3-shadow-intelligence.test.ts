import test from "node:test";
import assert from "node:assert/strict";
import { Agent3ShadowIntelligence } from "../src/server/scraper/agent3-shadow-intelligence";
import { Agent2PublishingEngine } from "../src/server/scraper/agent2-publishing-engine";
import type { NormalizedOfferContract } from "../src/server/scraper/source-health";

test("Agent 3 rejects non-competitor source types", async () => {
  const retailerOffer: NormalizedOfferContract = {
    sourceId: "amazon-crawler",
    sourceType: "RETAILER", // Invalid for Agent 3!
    productName: "Sony Headphone",
    brand: "Sony",
    productUrl: "https://amazon.in/dp/123",
    mrpPaise: 100000,
    sellingPricePaise: 80000,
    isAvailable: true,
    extractedAt: new Date(),
    extractionMethod: "STRUCTURED_DATA",
  };

  await assert.rejects(
    async () => {
      await Agent3ShadowIntelligence.recordCompetitorCandidate(retailerOffer);
    },
    /AGENT_3_SOURCE_VIOLATION/
  );
});

test("Agent 3 is architecturally blocked from calling Agent 2 Publishing Engine", async () => {
  const publishAttempt = await Agent2PublishingEngine.publishCandidate({
    candidateId: "shadow-record-456",
    authorizationToken: "illegal-token",
    callerAgent: "AGENT_3",
  });

  assert.equal(publishAttempt.published, false);
  assert.equal(publishAttempt.error, "AGENT_3_SHADOW_RESTRICTION: Agent 3 is in shadow mode and cannot invoke the publishing engine.");
});

test("Agent 3 accepts human evaluation labels without publishing deals", () => {
  const result = Agent3ShadowIntelligence.evaluateShadowOutcome({
    candidateId: "shadow-001",
    label: "GENUINE",
    reviewerId: "admin-user-1",
    notes: "Verified genuine competitor discovery",
  });

  assert.equal(result.evaluated, true);
  assert.equal(result.label, "GENUINE");
});

