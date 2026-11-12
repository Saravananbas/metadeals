import assert from "node:assert/strict";
import test from "node:test";

// Fixed, test-only values so the module can read its auth settings.
process.env.NEXTAUTH_SECRET ??= "test-nextauth-secret-0123456789abcdef0123";
process.env.NEXTAUTH_URL ??= "http://localhost:4123";
process.env.AUTH_SESSION_SECRET ??= "test-session-secret-0123456789abcdef0123";
process.env.AUTH_TOTP_ENCRYPTION_KEY ??= "dGVzdC10b3RwLWtleS1mb3ItYW5hbHl0aWNzLXRlc3Q=";
process.env.AUTH_BOOTSTRAP_EMAIL ??= "test@example.com";

// Loaded after the env above is set; tsx runs this file as CommonJS, so no top-level await.
const load = async () => ({
  ...(await import("../src/server/analytics/ua")),
  ...(await import("../src/server/analytics/collector")),
  ...(await import("../src/server/analytics/queries")),
});

test("user agents are reduced to device, browser and OS", async () => {
  const { parseUserAgent } = await load();
  assert.deepEqual(parseUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"), { deviceType: "desktop", browser: "Chrome", os: "Windows" });
  assert.deepEqual(parseUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Version/17 Mobile Safari/604.1"), { deviceType: "mobile", browser: "Safari", os: "iOS" });
  assert.equal(parseUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel) Chrome/120 Mobile Safari/537").deviceType, "mobile");
  assert.equal(parseUserAgent("Mozilla/5.0 (Linux; Android 14; SM-X900) Chrome/120 Safari/537").deviceType, "tablet");
});

test("paths are classified and deal slugs extracted", async () => {
  const { classifyPath } = await load();
  assert.deepEqual(classifyPath("/"), { pageType: "home" });
  assert.deepEqual(classifyPath("/deal/my-deal%20x?c=telegram"), { pageType: "deal", slug: "my-deal x" });
  assert.equal(classifyPath("/privacy").pageType, "privacy");
  assert.equal(classifyPath("/account/login").pageType, "account");
  assert.equal(classifyPath("/something-else").pageType, "other");
});

test("only external referrers are kept, as a host", async () => {
  const { referrerHostOf } = await load();
  assert.equal(referrerHostOf("https://www.google.com/search?q=x", "staging.metadeals4u.in"), "google.com");
  assert.equal(referrerHostOf("https://staging.metadeals4u.in/deal/x", "staging.metadeals4u.in"), null);
  assert.equal(referrerHostOf("not a url", null), null);
  assert.equal(referrerHostOf(undefined, null), null);
});

test("collect payloads are validated strictly", async () => {
  const { collectSchema } = await load();
  assert.ok(collectSchema.safeParse({ type: "PAGE_VIEW", path: "/", consent: false }).success);
  assert.ok(!collectSchema.safeParse({ type: "BUY_CLICK", path: "/", consent: false }).success, "buy clicks are server-side only");
  assert.ok(!collectSchema.safeParse({ type: "PAGE_VIEW", path: "no-slash", consent: false }).success);
  assert.ok(!collectSchema.safeParse({ type: "PAGE_VIEW", path: "/", consent: false, extra: 1 }).success, "unknown fields are rejected");
  assert.ok(!collectSchema.safeParse({ type: "HEARTBEAT", path: "/", consent: true, seconds: 999 }).success);
});

test("the anonymous visitor id is stable within a day and rotates daily", async () => {
  const { visitorHash } = await load();
  const day1 = new Date("2026-11-12T10:00:00Z"), day2 = new Date("2026-11-13T10:00:00Z");
  assert.equal(visitorHash("1.2.3.4", "UA", day1), visitorHash("1.2.3.4", "UA", new Date("2026-11-12T23:00:00Z")));
  assert.notEqual(visitorHash("1.2.3.4", "UA", day1), visitorHash("1.2.3.4", "UA", day2));
  assert.notEqual(visitorHash("1.2.3.4", "UA", day1), visitorHash("1.2.3.5", "UA", day1));
  assert.equal(visitorHash("1.2.3.4", "UA", day1).length, 32);
});

test("date ranges use Indian days and previous-period maths holds", async () => {
  const { istStartOfDay, resolveRange } = await load();
  const start = istStartOfDay(new Date("2026-11-12T20:00:00Z")); // 01:30 IST on the 13th
  assert.equal(start.toISOString(), "2026-11-12T18:30:00.000Z");
  const week = resolveRange("7d", null, null, new Date("2026-11-12T12:00:00Z"));
  assert.equal(week.to.getTime() - week.from.getTime(), 7 * 86_400_000);
  const today = resolveRange("today", null, null, new Date("2026-11-12T12:00:00Z"));
  assert.equal(today.to.getTime() - today.from.getTime(), 86_400_000);
  const custom = resolveRange("custom", "2026-11-01", "2026-11-03", new Date());
  assert.equal(custom.to.getTime() - custom.from.getTime(), 3 * 86_400_000, "custom range includes the end day");
  const bad = resolveRange("custom", "garbage", "2026-11-03", new Date("2026-11-12T12:00:00Z"));
  assert.equal(bad.to.getTime() - bad.from.getTime(), 7 * 86_400_000, "bad custom dates fall back to 7 days");
});

// Needs a real database: ANALYTICS_TEST_DB=1 npm test (uses the DATABASE_URL in .env; removes its own rows afterwards).
test("collect records anonymous and consented visits, ignores bots, and rollup sums then trims old rows", { skip: process.env.ANALYTICS_TEST_DB === "1" ? false : "set ANALYTICS_TEST_DB=1 to run against the local database" }, async () => {
  await import("dotenv/config");
  const { getDatabase, disconnectDatabase } = await import("../src/server/db/client");
  const { collect } = await import("../src/server/analytics/collector");
  const { runAnalyticsRollup } = await import("../src/server/analytics/rollup");
  const db = getDatabase();
  const facts = { ip: "9.9.9.9", userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537", host: "localhost:4123", purpose: null, sessionCookie: null };
  const ids: string[] = [];
  try {
    assert.equal((await collect({ type: "PAGE_VIEW", path: "/", consent: false }, { ...facts, userAgent: "Googlebot/2.1" })).skipped, true, "bots are skipped");
    assert.equal((await collect({ type: "PAGE_VIEW", path: "/admin/deals", consent: true }, facts)).skipped, true, "admin pages are skipped");

    const anon = await collect({ type: "PAGE_VIEW", path: "/", consent: false }, facts);
    assert.ok(anon.eventId && !anon.sessionId, "no session without consent");
    const first = await collect({ type: "PAGE_VIEW", path: "/", consent: true, referrer: "https://www.google.com/" }, facts);
    assert.ok(first.sessionId && first.eventId, "consent creates a session");
    ids.push(first.sessionId!);
    await collect({ type: "HEARTBEAT", path: "/", consent: true, eventId: first.eventId, seconds: 15 }, { ...facts, sessionCookie: first.sessionId! });
    const session = await db.analyticsSession.findUniqueOrThrow({ where: { id: first.sessionId! } });
    assert.equal(session.activeSeconds, 15);
    assert.equal(session.referrerHost, "google.com");
    assert.equal((await db.analyticsEvent.findUniqueOrThrow({ where: { id: first.eventId! } })).durationSec, 15);

    // Rollup: an event two days ago is summed; an event 100 days ago is summed and then deleted.
    const day = 86_400_000;
    const seed = (age: number, hash: string, type = "PAGE_VIEW") => db.analyticsEvent.create({ data: { visitorHash: hash, type, path: "/", pageType: "home", createdAt: new Date(Date.now() - age * day) } });
    await seed(2, "zz-test-a"); await seed(2, "zz-test-a"); await seed(2, "zz-test-b"); await seed(2, "zz-test-b", "BUY_CLICK"); const old = await seed(100, "zz-test-old");
    const result = await runAnalyticsRollup();
    assert.ok(result.rolledDays >= 1);
    assert.ok(result.deletedEvents >= 1);
    assert.equal(await db.analyticsEvent.count({ where: { id: old.id } }), 0, "events older than 90 days are deleted");
    const twoDaysAgo = await db.analyticsDaily.findMany({ where: { dimension: "total", date: { gte: new Date(Date.now() - 3 * day), lte: new Date(Date.now() - 1 * day) } } });
    assert.ok(twoDaysAgo.some((r) => r.views >= 3 && r.clicks >= 1), "daily totals include the seeded events");
    const again = await runAnalyticsRollup();
    assert.equal(again.deletedEvents, 0, "a second run is harmless");
  } finally {
    await db.analyticsEvent.deleteMany({ where: { visitorHash: { startsWith: "zz-test" } } });
    await db.analyticsSession.deleteMany({ where: { id: { in: ids } } });
    await db.analyticsEvent.deleteMany({ where: { OR: [{ sessionId: { in: ids } }, { path: "/", createdAt: { gte: new Date(Date.now() - 60_000) } }] } });
    await db.analyticsDaily.deleteMany({});
    await disconnectDatabase();
  }
});
