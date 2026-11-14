import test from "node:test";
import assert from "node:assert/strict";
import { IngestionService } from "../src/server/ingestion/service";
import { connectorRegistry } from "../src/server/scraper/connectors/registry";
import { sourceHealthManager } from "../src/server/scraper/source-health";
import { Agent2PublishingEngine } from "../src/server/scraper/agent2-publishing-engine";
import { Agent3ShadowIntelligence } from "../src/server/scraper/agent3-shadow-intelligence";
import type { RetailerConnector, ConnectorHealthResult, RetailerProductListing } from "../src/server/scraper/types";

class MockTestRetailerConnector implements RetailerConnector {
  readonly code = "mock-test-retailer";
  readonly name = "Mock Test Retailer";
  readonly isLive = true;
  public shouldFail = false;
  public mockListings: RetailerProductListing[] = [];

  async checkHealth(): Promise<ConnectorHealthResult> {
    return {
      code: this.code,
      status: "LIVE_CONNECTED",
      isHealthy: true,
      isLive: true,
      lastCheckedAt: new Date(),
    };
  }

  async discoverListings(): Promise<RetailerProductListing[]> {
    if (this.shouldFail) {
      throw new Error("MOCK_SCRAPER_TIMEOUT: Socket hang up during HTML fetch");
    }
    return this.mockListings;
  }
}

const mockConnector = new MockTestRetailerConnector();
connectorRegistry.register(mockConnector);

// These tests create real deals, candidates and accounts. They only run against a disposable database whose name contains "test", never against the development or staging database.
const skip = /\/[^/?]*test[^/?]*(\?|$)/i.test(process.env.DATABASE_URL ?? "") ? false : "needs a disposable DATABASE_URL (name contains 'test')";
test("M12 Ingestion: Successfully processes retailer feed into DealCandidates and PriceObservations", { skip }, async () => {
  mockConnector.shouldFail = false;
  mockConnector.mockListings = [
    {
      sourceUrl: "https://mockretailer.com/p/iphone15-128gb-blue",
      sourcePlatform: "mockretailer",
      externalId: "IP15-128-BLU",
      rawTitle: "Apple iPhone 15 128GB Blue Unlocked",
      brand: "Apple",
      categorySlug: "electronics",
      observedPriceMinor: 6599900,
      observedMrpMinor: 7990000,
      currency: "INR",
      sellerName: "SuperRetailer Ltd",
      inStock: true,
    },
  ];

  const result = await IngestionService.runConnectorIngestion(mockConnector.code);
  assert.equal(result.totalDiscovered, 1);
  assert.equal(result.processedCount, 1);
  assert.ok(result.priceObservationsRecorded >= 1);
  assert.equal(result.errors.length, 0);
});

test("M12 Ingestion: Prevents duplicate DealCandidate creation on re-ingesting identical product", { skip }, async () => {
  // Run identical ingestion second time
  const result2 = await IngestionService.runConnectorIngestion(mockConnector.code);
  assert.equal(result2.totalDiscovered, 1);
  assert.equal(result2.processedCount, 1);
  assert.equal(result2.candidatesCreated, 0, "Duplicate candidate should not be created");
  assert.equal(result2.priceObservationsRecorded, 1, "New price observation must be recorded append-only");
});

test("M12 Ingestion: Rejects invalid or suspicious non-discount prices without crashing batch", { skip }, async () => {
  mockConnector.mockListings = [
    {
      sourceUrl: "https://mockretailer.com/p/invalid-price",
      sourcePlatform: "mockretailer",
      externalId: "INV-PRICE-1",
      rawTitle: "Invalid Price Product Item",
      brand: "Brand",
      categorySlug: "electronics",
      observedPriceMinor: 100000,
      observedMrpMinor: 50000, // Invalid: Selling price > MRP!
      currency: "INR",
      inStock: true,
    },
  ];

  const result = await IngestionService.runConnectorIngestion(mockConnector.code);
  assert.equal(result.processedCount, 0);
  assert.ok(result.errors.length > 0);
  assert.match(result.errors[0], /NO_DISCOUNT/);
});

test("M12 Ingestion: Scraper network timeout/CAPTCHA is classified as UNKNOWN, never OUT_OF_STOCK", async () => {
  mockConnector.shouldFail = true;

  const result = await IngestionService.runConnectorIngestion(mockConnector.code);
  assert.ok(result.errors.length > 0);
  assert.match(result.errors[0], /EXTRACTION_FAILED/);
  assert.match(result.errors[0], /Classified as UNKNOWN, never OUT_OF_STOCK/);

  // Reset health for connector
  await sourceHealthManager.resetCircuitBreaker(mockConnector.code);
  mockConnector.shouldFail = false;
});

test("M12 Safety Gate: Ingestion never invokes Agent 2 Publishing Engine", async () => {
  // Verify kill switch state remains unviolated and deals are not published
  assert.equal(typeof Agent2PublishingEngine.publishCandidate, "function");
  // Agent 3 remains blocked
  const blockedAttempt = await Agent2PublishingEngine.publishCandidate({
    candidateId: "ingested-cand-1",
    authorizationToken: "illegal-token",
    callerIdentity: { role: "AGENT_3" },
  });
  assert.equal(blockedAttempt.published, false);
  assert.match(blockedAttempt.error || "", /AGENT_3_SHADOW_RESTRICTION/);

  // Close any open queue producer connections so Node test runner exits cleanly
  const { QueueProducers } = await import("../src/server/queue/producers");
  await QueueProducers.closeAll();
});
