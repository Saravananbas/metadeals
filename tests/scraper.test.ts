import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateDiscountPercent,
  evaluatePriceAnomaly,
  candidateInputSchema,
  candidateReviewActionSchema,
} from "../src/features/scraper/validation";
import { AmazonDealsConnector, FlipkartDealsConnector } from "../src/server/scraper/connectors/retailer-generic";
import { CuelinksFeedConnector } from "../src/server/scraper/connectors/cuelinks-feed";
import { ScraperService, type DatabaseClient } from "../src/server/scraper/service";

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

test("Amazon and Flipkart connectors report FIXTURE_MODE and non-live when credentials are absent", async () => {
  const amazon = new AmazonDealsConnector();
  const amazonHealth = await amazon.checkHealth();
  assert.equal(amazonHealth.status, "FIXTURE_MODE");
  assert.equal(amazonHealth.isHealthy, false);
  assert.equal(amazonHealth.isLive, false);
  assert.match(amazonHealth.message ?? "", /PA-API/);

  const amazonListings = await amazon.discoverListings();
  assert.equal(amazonListings.length, 2);
  assert.equal(amazonListings[0].isMockOrFixture, true);

  const flipkart = new FlipkartDealsConnector();
  const flipkartHealth = await flipkart.checkHealth();
  assert.equal(flipkartHealth.status, "FIXTURE_MODE");
  assert.equal(flipkartHealth.isHealthy, false);
  assert.equal(flipkartHealth.isLive, false);
  assert.match(flipkartHealth.message ?? "", /Affiliate API/);

  const flipkartListings = await flipkart.discoverListings();
  assert.equal(flipkartListings.length, 2);
  assert.equal(flipkartListings[0].isMockOrFixture, true);
});

test("Cuelinks connector reports MOCK_MODE without external API credentials", async () => {
  const cuelinks = new CuelinksFeedConnector();
  const health = await cuelinks.checkHealth();
  assert.equal(health.status, "MOCK_MODE");
  assert.equal(health.isHealthy, false);
  assert.equal(health.isLive, false);
  assert.match(health.message ?? "", /mock\/fallback/);

  const listings = await cuelinks.discoverListings();
  assert.ok(listings.length >= 2);
  assert.equal(listings[0].isMockOrFixture, true);
});

test("Idempotent ingestion prevents duplicate candidates and deals on repeated scans", async () => {
  // Isolated in-memory DB fixture
  const candidates: Array<Record<string, unknown>> = [];
  const deals: Array<Record<string, unknown>> = [];
  const priceObservations: Array<Record<string, unknown>> = [];

  const mockDb = {
    dealCandidate: {
      findFirst: async ({ where }: { where: { sourcePlatform?: string; externalId?: string; sourceUrl?: string } }) => {
        return (
          candidates.find((c) => {
            if (where.sourcePlatform && where.externalId) {
              return c.sourcePlatform === where.sourcePlatform && c.externalId === where.externalId;
            }
            if (where.sourceUrl) {
              return c.sourceUrl === where.sourceUrl;
            }
            return false;
          }) ?? null
        );
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const item = { ...data, id: `cand-${candidates.length + 1}`, createdAt: new Date(), updatedAt: new Date(), deal: null };
        candidates.push(item);
        return item;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const item = candidates.find((c) => c.id === where.id);
        if (!item) throw new Error("Not found");
        Object.assign(item, data, { updatedAt: new Date() });
        return item;
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        return candidates.find((c) => c.id === where.id) ?? null;
      },
    },
    deal: {
      findFirst: async ({ where }: { where: { productUrl?: string } }) => {
        return deals.find((d) => d.productUrl === where.productUrl) ?? null;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const deal = { ...data, id: `deal-${deals.length + 1}`, createdAt: new Date() };
        deals.push(deal);
        return deal;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const deal = deals.find((d) => d.id === where.id);
        if (!deal) throw new Error("Not found");
        Object.assign(deal, data);
        return deal;
      },
    },
    priceObservation: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const obs = { ...data, id: `obs-${priceObservations.length + 1}`, observedAt: new Date() };
        priceObservations.push(obs);
        return obs;
      },
      findMany: async () => [],
    },
  } as unknown as DatabaseClient;

  const service = new ScraperService();

  const listing = {
    sourceUrl: "https://www.flipkart.com/samsung-galaxy-s23/p/itm123",
    sourcePlatform: "flipkart",
    externalId: "MOBGTAGG4GZSTXAY",
    rawTitle: "SAMSUNG Galaxy S23 5G (Phantom Black, 128 GB)",
    brand: "Samsung",
    categorySlug: "electronics",
    observedPriceMinor: 4499900,
    observedMrpMinor: 7499900,
    currency: "INR",
    isMockOrFixture: false,
  };

  // First scan: Ingest candidate
  const first = await service.ingestCandidate(mockDb, listing, { isMockOrFixture: true });
  assert.equal(candidates.length, 1);
  assert.equal(deals.length, 0); // Mock held, protected from auto-publishing
  assert.equal(priceObservations.length, 1);
  assert.equal(first.outcome, "MOCK_HELD");

  // Second scan: Exact same listing discovered again
  const second = await service.ingestCandidate(mockDb, listing, { isMockOrFixture: true });
  assert.equal(candidates.length, 1, "Must NOT create duplicate candidate");
  assert.equal(deals.length, 0, "Must NOT create duplicate deal");
  assert.equal(priceObservations.length, 2, "Must log new price observation");
  assert.equal(second.isDuplicate, true);
  assert.equal(second.outcome, "EXISTING_RETAINED");

  // Third scan: Price changed
  const priceDrop = { ...listing, observedPriceMinor: 4199900 };
  const third = await service.ingestCandidate(mockDb, priceDrop, { isMockOrFixture: true });
  assert.equal(candidates.length, 1, "Must NOT create duplicate candidate on price change");
  assert.equal(priceObservations.length, 3, "Must append historical price observation");
  assert.equal(third.outcome, "PRICE_UPDATED");
  assert.equal(candidates[0].observedPriceMinor, 4199900);

  // Different variant: 256 GB variant has distinct externalId and URL
  const variant = {
    ...listing,
    sourceUrl: "https://www.flipkart.com/samsung-galaxy-s23-256gb/p/itm124",
    externalId: "MOBGTAGG4GZSTXAZ",
    rawTitle: "SAMSUNG Galaxy S23 5G (Phantom Black, 256 GB)",
    observedPriceMinor: 4999900,
  };
  const fourth = await service.ingestCandidate(mockDb, variant, { isMockOrFixture: true });
  assert.equal(candidates.length, 2, "Distinct variant must be preserved as its own candidate");
  assert.equal(fourth.isDuplicate, undefined);
});

test("publishVerifiedCandidate assigns neutral placeholder without cross-contaminating unrelated media", async () => {
  const { publishVerifiedCandidate } = await import("../src/server/scraper/publishing");

  const mediaStore: Array<Record<string, unknown>> = [
    { id: "media-iphone", alt: "phone product image", storageKey: "iphone.webp" },
    { id: "media-airfryer", alt: "air-fryer product image", storageKey: "air-fryer.webp" },
    { id: "media-shoes", alt: "shoes product image", storageKey: "shoes.webp" },
  ];
  const deals: Array<Record<string, unknown>> = [];
  const candidates: Array<Record<string, unknown>> = [
    {
      id: "cand-buddha",
      rawTitle: "Global Grabbers Sitting Buddha Showpiece",
      brand: "Global Grabbers",
      categorySlug: "home",
      sourcePlatform: "amazon",
      sourceUrl: "https://www.amazon.in/dp/B07LF3PQYF",
      externalId: "B07LF3PQYF",
      observedPriceMinor: 149900,
      observedMrpMinor: 299900,
      currency: "INR",
      imageUrl: null, // No image provided
    },
    {
      id: "cand-backpack",
      rawTitle: "Skybags Casual Unisex Daypack with Bottle Holder (30L)",
      brand: "Skybags",
      categorySlug: "travel",
      sourcePlatform: "amazon",
      sourceUrl: "https://www.amazon.in/dp/B09ABCDE",
      externalId: "B09ABCDE",
      observedPriceMinor: 109900,
      observedMrpMinor: 249900,
      currency: "INR",
      imageUrl: null, // No image provided
    },
  ];

  const mockDb = {
    dealCandidate: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        candidates.find((c) => c.id === where.id),
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const item = candidates.find((c) => c.id === where.id);
        if (item) Object.assign(item, data);
        return item;
      },
    },
    user: {
      findFirst: async () => ({ id: "admin-1" }),
    },
    category: {
      findUnique: async ({ where }: { where: { slug: string } }) => ({ id: `cat-${where.slug}`, slug: where.slug, name: where.slug }),
      create: async ({ data }: { data: Record<string, unknown> }) => ({ id: `cat-${data.slug}`, ...data }),
    },
    merchant: {
      findUnique: async () => ({ id: "merch-amazon", slug: "amazon", name: "Amazon India" }),
      create: async ({ data }: { data: Record<string, unknown> }) => ({ id: `merch-${data.slug}`, ...data }),
    },
    media: {
      findFirst: async ({ where }: { where?: { alt?: string } }) =>
        mediaStore.find((m) => where?.alt && m.alt === where.alt),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const item = { ...data, id: `media-placeholder-${mediaStore.length + 1}` };
        mediaStore.push(item);
        return item;
      },
    },
    deal: {
      findUnique: async ({ where }: { where: { slug?: string; id?: string } }) =>
        deals.find((d) => (where.id && d.id === where.id) || (where.slug && d.slug === where.slug)),
      findFirst: async ({ where }: { where: { productUrl?: string } }) =>
        deals.find((d) => where.productUrl && d.productUrl === where.productUrl),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const deal = { ...data, id: `deal-${deals.length + 1}` };
        deals.push(deal);
        return deal;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const deal = deals.find((d) => d.id === where.id);
        if (deal) Object.assign(deal, data);
        return deal;
      },
    },
    priceObservation: {
      create: async () => ({}),
      findMany: async () => [],
    },
    distributionDestination: {
      findFirst: async () => null,
    },
  } as unknown as DatabaseClient;

  // 1. Publish Buddha statue
  const buddhaDeal = await publishVerifiedCandidate(mockDb, "cand-buddha", "admin-1");
  assert.equal(deals.length, 1);
  // Buddha MUST NOT be assigned the air fryer image or phone image!
  assert.notEqual(buddhaDeal.mediaId, "media-airfryer");
  assert.notEqual(buddhaDeal.mediaId, "media-iphone");
  const assignedMedia = mediaStore.find((m) => m.id === buddhaDeal.mediaId);
  assert.equal(assignedMedia?.alt, "Product placeholder");

  // 2. Publish Daypack
  const backpackDeal = await publishVerifiedCandidate(mockDb, "cand-backpack", "admin-1");
  assert.equal(deals.length, 2);
  // Backpack MUST NOT be assigned shoes image!
  assert.notEqual(backpackDeal.mediaId, "media-shoes");
  assert.equal(backpackDeal.mediaId, buddhaDeal.mediaId, "Shares the neutral placeholder");

  // 3. Re-publishing same candidate updates existing deal without duplicating
  const republished = await publishVerifiedCandidate(mockDb, "cand-buddha", "admin-1");
  assert.equal(deals.length, 2, "Must NOT duplicate deal on re-publishing");
  assert.equal(republished.id, buddhaDeal.id);
});
