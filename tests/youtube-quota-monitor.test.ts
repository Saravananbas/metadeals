import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateThresholdStatus,
  ENDPOINT_QUOTA_COSTS,
  getDailySearchCap,
  getDailyQuotaCap,
  getPacificDayBoundaries,
  sanitizeErrorMessage,
} from "../src/server/youtube/quota-service";
import {
  buildCanonicalProductKey,
  buildYouTubeSearchQuery,
  formatYouTubeDuration,
} from "../src/server/youtube/reviews-service";

test("calculateThresholdStatus enforces 4-tier health thresholds correctly", () => {
  // 0 - 69%: HEALTHY (Green)
  assert.equal(calculateThresholdStatus(0), "HEALTHY");
  assert.equal(calculateThresholdStatus(35), "HEALTHY");
  assert.equal(calculateThresholdStatus(69), "HEALTHY");
  assert.equal(calculateThresholdStatus(69.9), "HEALTHY");

  // 70 - 89%: NEAR_LIMIT (Amber)
  assert.equal(calculateThresholdStatus(70), "NEAR_LIMIT");
  assert.equal(calculateThresholdStatus(80), "NEAR_LIMIT");
  assert.equal(calculateThresholdStatus(89.9), "NEAR_LIMIT");

  // 90 - 100%: CRITICAL (Red)
  assert.equal(calculateThresholdStatus(90), "CRITICAL");
  assert.equal(calculateThresholdStatus(95), "CRITICAL");
  assert.equal(calculateThresholdStatus(100), "CRITICAL");

  // > 100%: QUOTA_EXCEEDED (Red)
  assert.equal(calculateThresholdStatus(100.1), "QUOTA_EXCEEDED");
  assert.equal(calculateThresholdStatus(120), "QUOTA_EXCEEDED");
});

test("YouTube Data API quota cost rules and daily caps meet specification", () => {
  // search.list: 100 quota units per request
  assert.equal(ENDPOINT_QUOTA_COSTS["search.list"], 100);

  // videos.list: 1 quota unit per request
  assert.equal(ENDPOINT_QUOTA_COSTS["videos.list"], 1);

  // Default daily allocation: 10,000 units
  assert.equal(getDailyQuotaCap(), 10000);

  // Internal daily search cap: 80 calls
  assert.equal(getDailySearchCap(), 80);
});

test("getPacificDayBoundaries accurately targets midnight Pacific Time reset", () => {
  const boundaries = getPacificDayBoundaries();
  assert.ok(boundaries.dayStart instanceof Date);
  assert.ok(boundaries.dayEnd instanceof Date);
  assert.ok(boundaries.dayEnd.getTime() > boundaries.dayStart.getTime());
  assert.ok(boundaries.resetFormatted.includes("Resets at 00:00"));
});

test("buildCanonicalProductKey normalizes brand and product model/variant to match across deals", () => {
  // Two deals with slight title variation refer to the same canonical product:
  const key1 = buildCanonicalProductKey("Apple", "Apple iPhone 14 (128 GB) - Blue");
  const key2 = buildCanonicalProductKey("Apple", "Apple iPhone 14 128GB Blue");
  assert.equal(key1, key2);

  const samsung1 = buildCanonicalProductKey("Samsung", "Samsung Galaxy S23 5G 128GB Grey");
  const samsung2 = buildCanonicalProductKey("Samsung", "Samsung Galaxy S23 5G (128GB, 8GB RAM)");
  assert.ok(samsung1.includes("samsung_galaxy_s23_5g_128gb"));
  assert.ok(samsung2.includes("samsung_galaxy_s23_5g_128gb"));

  // Different product models and hardware variants must have distinct canonical keys (never merged)
  const macbook = buildCanonicalProductKey("Apple", "MacBook Air M2 256GB");
  assert.notEqual(key1, macbook);

  const iphone128 = buildCanonicalProductKey("Apple", "Apple iPhone 14 128GB Blue");
  const iphone256 = buildCanonicalProductKey("Apple", "Apple iPhone 14 256GB Blue");
  assert.notEqual(iphone128, iphone256, "128GB and 256GB variants must never be merged");

  const s23Regular = buildCanonicalProductKey("Samsung", "Samsung Galaxy S23 5G 128GB");
  const s23Ultra = buildCanonicalProductKey("Samsung", "Samsung Galaxy S23 Ultra 5G 256GB");
  assert.notEqual(s23Regular, s23Ultra, "Regular and Ultra models must never be merged");
});

test("Real YouTube Data API v3 live call succeeds with configured key", async () => {
  const apiKey = process.env.YOUTUBE_DATA_API_KEY;
  if (!apiKey) {
    // If not set in test environment, skip gracefully
    return;
  }
  const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&maxResults=1&q=Sony+WH-1000XM5+review&key=${apiKey}`;
  const res = await fetch(searchUrl, { headers: { Accept: "application/json" } });
  assert.equal(res.status, 200, `Live YouTube API request failed with status ${res.status}`);
  const data = (await res.json()) as { items?: Array<{ id?: { videoId?: string } }> };
  assert.ok(Array.isArray(data.items));
  assert.ok(data.items.length > 0);
  assert.ok(data.items[0].id?.videoId);
});

test("buildYouTubeSearchQuery builds clean, focused search terms without promo noise", () => {
  const query = buildYouTubeSearchQuery(
    "Sony",
    "Sony WH-1000XM5 Wireless Noise Canceling Headphones (Black) at best price online 20% off"
  );
  assert.ok(query.includes("Sony WH-1000XM5 Wireless Noise Canceling Headphones review"));
  assert.ok(!query.includes("best price"));
  assert.ok(!query.includes("20% off"));
});

test("formatYouTubeDuration formats ISO durations properly", () => {
  assert.equal(formatYouTubeDuration("PT14M32S"), "14:32");
  assert.equal(formatYouTubeDuration("PT1H2M3S"), "1:02:03");
  assert.equal(formatYouTubeDuration("PT45S"), "0:45");
  assert.equal(formatYouTubeDuration(null), "");
});

test("sanitizeErrorMessage prevents API keys or secrets from leaking to database ledger", () => {
  const rawError = "Request failed for url https://www.googleapis.com/youtube/v3/search?key=AIzaSyD-sampleSecretKey1234567890&part=snippet";
  const sanitized = sanitizeErrorMessage(rawError);
  assert.ok(!sanitized.includes("AIzaSyD-sampleSecretKey1234567890"));
  assert.ok(sanitized.includes("[REDACTED_API_KEY]"));
});

