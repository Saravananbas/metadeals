import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

// Needs a DISPOSABLE migrated database (name contains "test"): TELEGRAM_TEST_DB=1 DATABASE_URL=... node --test --test-force-exit tests/telegram-approval-hardening.test.ts
const databaseUrl = process.env.DATABASE_URL ?? "";
const safe = /\/[^/?]*test[^/?]*(\?|$)/i.test(databaseUrl);
const skip = process.env.TELEGRAM_TEST_DB === "1" && safe ? false : "set TELEGRAM_TEST_DB=1 and point DATABASE_URL at a disposable database whose name contains 'test'";
process.env.NEXTAUTH_SECRET ??= "test-nextauth-secret-0123456789abcdef0123";
process.env.NEXTAUTH_URL ??= "http://localhost:4123";
process.env.AUTH_SESSION_SECRET ??= "test-session-secret-0123456789abcdef0123";
process.env.AUTH_TOTP_ENCRYPTION_KEY ??= "dGVzdC10b3RwLWtleS1mb3ItYW5hbHl0aWNzLXRlc3Q=";
process.env.AUTH_BOOTSTRAP_EMAIL ??= "test@example.com";

const SECRET = "callback-signing-secret-0123456789abcdef";
const sign = (candidateId: string, action: string, userId: string, timestamp: number) =>
  crypto.createHmac("sha256", SECRET).update(`${userId}:${candidateId}:${action}:${timestamp}`).digest("hex");
const lie = { authenticityScore: 99, attractivenessScore: 99, isPriceErrorSuspected: false };

async function setup(suffix: string) {
  const { getDatabase } = await import("../src/server/db/client");
  const { Agent1DealHunter } = await import("../src/server/scraper/agent1-deal-hunter");
  const db = getDatabase();
  const id = `tg-hard-${suffix}-${Date.now()}`;
  await db.publicationAuthorization.deleteMany({ where: { candidateId: id } });
  await db.dealCandidate.deleteMany({ where: { id } });
  await db.dealCandidate.create({ data: { id, sourceUrl: "https://www.flipkart.com/x/p/1", sourcePlatform: "flipkart", rawTitle: "Test candidate", categorySlug: "mobiles", observedPriceMinor: 100000, observedMrpMinor: 200000 } });
  const approve = (timestamp = Date.now(), secret = SECRET, body = lie) =>
    Agent1DealHunter.handleTelegramApproval(id, { action: "APPROVE", telegramUserId: "admin-1", timestamp, signature: sign(id, "APPROVE", "admin-1", timestamp) }, body, ["admin-1"], secret);
  const cleanup = async () => { await db.publicationAuthorization.deleteMany({ where: { candidateId: id } }); await db.dealCandidate.deleteMany({ where: { id } }); };
  return { db, Agent1DealHunter, id, approve, cleanup };
}

test("approval needs a stored pending record; the callback body cannot create one", { skip }, async () => {
  const { approve, cleanup } = await setup("none");
  try {
    const result = await approve();
    assert.equal(result.success, false);
    assert.match(result.error ?? "", /NO_PENDING_AUTHORIZATION/);
  } finally { await cleanup(); }
});

test("a stored price-error flag blocks approval even if the callback claims otherwise", { skip }, async () => {
  const { Agent1DealHunter, id, approve, cleanup } = await setup("price");
  try {
    await Agent1DealHunter.registerPendingApproval(id, { isPriceErrorSuspected: true, authenticityScore: 40, attractivenessScore: 90 });
    const result = await approve();
    assert.equal(result.success, false);
    assert.match(result.error ?? "", /PRICE_ERROR_POLICY/);
  } finally { await cleanup(); }
});

test("a good stored record is approved with stored scores, once only", { skip }, async () => {
  const { db, Agent1DealHunter, id, approve, cleanup } = await setup("ok");
  try {
    await Agent1DealHunter.registerPendingApproval(id, { isPriceErrorSuspected: false, authenticityScore: 81, attractivenessScore: 77 });
    const first = await approve();
    assert.equal(first.success, true, first.error);
    const row = await db.publicationAuthorization.findUniqueOrThrow({ where: { candidateId: id } });
    assert.equal(row.status, "APPROVED");
    assert.equal(row.confidenceScore, 81, "scores come from the database, not the callback (which claimed 99)");
    const second = await approve(Date.now() + 5);
    assert.equal(second.success, false, "a second approval is refused");
  } finally { await cleanup(); }
});

test("no signing key means no approval, and future-dated callbacks are refused", { skip }, async () => {
  const { Agent1DealHunter, id, approve, cleanup } = await setup("key");
  try {
    await Agent1DealHunter.registerPendingApproval(id, { isPriceErrorSuspected: false, authenticityScore: 81, attractivenessScore: 77 });
    delete process.env.TELEGRAM_CALLBACK_SECRET;
    const noKey = await approve(Date.now(), "");
    assert.match(noKey.error ?? "", /CALLBACK_SECRET_NOT_CONFIGURED/);
    const future = await approve(Date.now() + 10 * 60_000);
    assert.match(future.error ?? "", /STALE_CALLBACK/);
  } finally { await cleanup(); }
});

test("a rejection closes the offer, and an approved record cannot be reopened", { skip }, async () => {
  const { db, Agent1DealHunter, id, approve, cleanup } = await setup("close");
  try {
    await Agent1DealHunter.registerPendingApproval(id, { isPriceErrorSuspected: false, authenticityScore: 80, attractivenessScore: 70 });
    const timestamp = Date.now();
    const rejected = await Agent1DealHunter.handleTelegramApproval(id, { action: "REJECT", telegramUserId: "admin-1", timestamp, signature: sign(id, "REJECT", "admin-1", timestamp) }, lie, ["admin-1"], SECRET);
    assert.equal(rejected.success, true, rejected.error);
    assert.equal((await db.publicationAuthorization.findUniqueOrThrow({ where: { candidateId: id } })).status, "REJECTED");
    assert.match((await approve(Date.now() + 7)).error ?? "", /NO_PENDING_AUTHORIZATION/, "a later APPROVE cannot revive a rejected offer");
    // approve a fresh offer, then try to register it again
    await Agent1DealHunter.registerPendingApproval(id, { isPriceErrorSuspected: false, authenticityScore: 80, attractivenessScore: 70 });
    assert.equal((await approve(Date.now() + 11)).success, true);
    await Agent1DealHunter.registerPendingApproval(id, { isPriceErrorSuspected: false, authenticityScore: 10, attractivenessScore: 10 });
    const row = await db.publicationAuthorization.findUniqueOrThrow({ where: { candidateId: id } });
    assert.equal(row.status, "APPROVED", "registering again must not reset an approved record");
    assert.equal(row.confidenceScore, 80);
  } finally { await cleanup(); }
});
