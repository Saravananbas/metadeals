import test from "node:test";
import assert from "node:assert/strict";
import {
  validateDestinationHost,
  isCrawlerOrPrefetch,
  createActorHash,
  transactionRowSchema,
  importBatchSchema,
} from "../src/features/affiliate/validation";
import { AmazonAdapter } from "../src/server/affiliate/adapters/amazon";
import { FlipkartAdapter } from "../src/server/affiliate/adapters/flipkart";
import { CuelinksAdapter } from "../src/server/affiliate/adapters/cuelinks";
import { convertMerchantUrl } from "../src/server/affiliate/adapters/registry";

test("validateDestinationHost rejects open redirects and untrusted domains", () => {
  const merchantWeb = "https://www.amazon.in";
  const affiliateHosts = ["amzn.to", "amazon.in"];

  // Valid destinations
  assert.equal(validateDestinationHost("https://www.amazon.in/dp/B0CX234", merchantWeb, affiliateHosts), true);
  assert.equal(validateDestinationHost("https://amazon.in/dp/B0CX234", merchantWeb, affiliateHosts), true);
  assert.equal(validateDestinationHost("https://amzn.to/3xyz", merchantWeb, affiliateHosts), true);

  // Invalid protocol
  assert.equal(validateDestinationHost("http://www.amazon.in/dp/B0CX234", merchantWeb, affiliateHosts), false);
  assert.equal(validateDestinationHost("javascript:alert(1)", merchantWeb, affiliateHosts), false);

  // Untrusted domains / open redirect vectors
  assert.equal(validateDestinationHost("https://evil-amazon.in/steal", merchantWeb, affiliateHosts), false);
  assert.equal(validateDestinationHost("https://attacker.example.com", merchantWeb, affiliateHosts), false);
  assert.equal(validateDestinationHost("https://amazon.in.attacker.example.com", merchantWeb, affiliateHosts), false);
});

test("isCrawlerOrPrefetch detects crawlers, bots, and prefetch headers", () => {
  // Prefetch headers
  assert.equal(isCrawlerOrPrefetch("Mozilla/5.0", "prefetch"), true);
  assert.equal(isCrawlerOrPrefetch("Mozilla/5.0", "Sec-Purpose: prefetch"), true);

  // Known bots
  assert.equal(isCrawlerOrPrefetch("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", null), true);
  assert.equal(isCrawlerOrPrefetch("curl/8.4.0", null), true);
  assert.equal(isCrawlerOrPrefetch("python-requests/2.31.0", null), true);
  assert.equal(isCrawlerOrPrefetch("", null), true);
  assert.equal(isCrawlerOrPrefetch(null, null), true);

  // Standard consumer browser
  const realBrowser = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
  assert.equal(isCrawlerOrPrefetch(realBrowser, null), false);
});

test("createActorHash produces consistent daily HMAC digests without storing PII", () => {
  const secret = "test-session-secret-key-32-chars-minimum!";
  const day1 = new Date("2026-11-03T10:00:00Z");
  const day2 = new Date("2026-11-04T10:00:00Z");

  const hash1a = createActorHash("192.168.1.10", "Chrome/131", secret, day1);
  const hash1b = createActorHash("192.168.1.10", "Chrome/131", secret, day1);
  const hash2 = createActorHash("192.168.1.10", "Chrome/131", secret, day2);
  const differentIp = createActorHash("10.0.0.1", "Chrome/131", secret, day1);

  assert.equal(hash1a, hash1b, "Same IP and UA on same day must produce identical hash");
  assert.notEqual(hash1a, hash2, "Different day must rotate hash salt for privacy");
  assert.notEqual(hash1a, differentIp, "Different IP must produce different hash");
  assert.equal(hash1a.length, 64, "SHA-256 output must be 64 hex characters");
});

test("Amazon adapter adds tag and sub-id only when configured", () => {
  const adapter = new AmazonAdapter();
  assert.equal(adapter.canHandle("https://www.amazon.in/dp/B01", "www.amazon.in"), true);
  assert.equal(adapter.canHandle("https://www.flipkart.com/p", "www.flipkart.com"), false);

  delete process.env.AMAZON_ASSOCIATE_TAG;
  const unconfigured = adapter.convertUrl("https://www.amazon.in/dp/B01", { dealId: "d1" });
  assert.equal(unconfigured.isAffiliate, false);
  assert.equal(unconfigured.url, "https://www.amazon.in/dp/B01");

  process.env.AMAZON_ASSOCIATE_TAG = "metadeals-test-21";
  const configured = adapter.convertUrl("https://www.amazon.in/dp/B01", { dealId: "d1", subId: "sub123" });
  assert.equal(configured.isAffiliate, true);
  assert.match(configured.url, /tag=metadeals-test-21/);
  assert.match(configured.url, /ascsubtag=sub123/);
  delete process.env.AMAZON_ASSOCIATE_TAG;
});

test("Flipkart adapter adds affid and sub-id only when configured", () => {
  const adapter = new FlipkartAdapter();
  assert.equal(adapter.canHandle("https://www.flipkart.com/item", "www.flipkart.com"), true);

  delete process.env.FLIPKART_AFFILIATE_ID;
  const clean = adapter.convertUrl("https://www.flipkart.com/item", { dealId: "d1" });
  assert.equal(clean.isAffiliate, false);

  process.env.FLIPKART_AFFILIATE_ID = "fk-metadeals";
  const converted = adapter.convertUrl("https://www.flipkart.com/item", { dealId: "d1", subId: "sub456" });
  assert.equal(converted.isAffiliate, true);
  assert.match(converted.url, /affid=fk-metadeals/);
  assert.match(converted.url, /affExtParam1=sub456/);
  delete process.env.FLIPKART_AFFILIATE_ID;
});

test("Cuelinks adapter wraps URLs only when configured", () => {
  const adapter = new CuelinksAdapter();

  delete process.env.CUELINKS_PUB_ID;
  assert.equal(adapter.canHandle("https://www.myntra.com/shirt", "www.myntra.com"), false);

  process.env.CUELINKS_PUB_ID = "12345";
  assert.equal(adapter.canHandle("https://www.myntra.com/shirt", "www.myntra.com"), true);
  const converted = adapter.convertUrl("https://www.myntra.com/shirt", { dealId: "d1", subId: "sub789" });
  assert.equal(converted.isAffiliate, true);
  assert.match(converted.url, /pub_id=12345/);
  assert.match(converted.url, /subid=sub789/);

  // With a channel id the link uses cid (what Cuelinks' own API returns), not the publisher id.
  process.env.CUELINKS_CHANNEL_ID = "337441";
  const withChannel = adapter.convertUrl("https://www.myntra.com/shirt", { dealId: "d1", subId: "sub789" });
  assert.match(withChannel.url, /cid=337441/);
  assert.match(withChannel.url, /source=api/);
  assert.doesNotMatch(withChannel.url, /pub_id=/);
  delete process.env.CUELINKS_CHANNEL_ID;
  delete process.env.CUELINKS_PUB_ID;
});

test("Tata CLiQ, Myntra, AJIO, Croma, Reliance Digital and Nykaa links use the same Cuelinks link as every other store, never clnk.in/r?id=", () => {
  process.env.CUELINKS_CHANNEL_ID = "337441";
  process.env.CUELINKS_PUB_ID = "286339";
  for (const host of ["www.tatacliq.com", "www.myntra.com", "www.ajio.com", "www.croma.com", "www.reliancedigital.in", "www.nykaa.com", "www.flipkart.com", "www.amazon.in"]) {
    const result = convertMerchantUrl(`https://${host}/p/1`, host, { dealId: "d1", subId: "web" });
    assert.match(result.url, /^https:\/\/linksredirect\.com\/\?cid=337441&source=api&url=/, host);
    assert.doesNotMatch(result.url, /clnk\.in/, host);
  }
  delete process.env.CUELINKS_CHANNEL_ID;
  delete process.env.CUELINKS_PUB_ID;
});

test("convertMerchantUrl falls back to clean direct link when no adapter matches", () => {
  const direct = convertMerchantUrl("https://www.reliance.com/tv", "www.reliance.com", { dealId: "d1" });
  assert.equal(direct.isAffiliate, false);
  assert.equal(direct.provider, "direct");
  assert.equal(direct.url, "https://www.reliance.com/tv");
});

test("transactionRowSchema validates commission paise and status values", () => {
  const validRow = {
    externalId: "TX-9988",
    dealId: "deal-1",
    status: "APPROVED" as const,
    commissionMinor: 15000, // 150.00 INR in paise
    currency: "INR" as const,
    reportedAt: "2026-11-03T10:00:00.000Z",
  };
  assert.equal(transactionRowSchema.safeParse(validRow).success, true);

  // Negative commission rejected
  assert.equal(transactionRowSchema.safeParse({ ...validRow, commissionMinor: -500 }).success, false);

  // Invalid status rejected
  assert.equal(transactionRowSchema.safeParse({ ...validRow, status: "FABRICATED" }).success, false);

  // Batch schema requires at least 1 row and max 1000
  assert.equal(importBatchSchema.safeParse({ provider: "cuelinks", transactions: [] }).success, false);
  assert.equal(importBatchSchema.safeParse({ provider: "cuelinks", transactions: [validRow] }).success, true);
});
