import assert from "node:assert/strict";
import { test } from "node:test";
import { getDatabase } from "@/server/db/client";
import { SharedSecurityStore, getSharedRedis } from "@/server/queue/security-store";
import { Agent2PublishingEngine } from "@/server/scraper/agent2-publishing-engine";
import { PublishingReconciliationWorker } from "@/server/scraper/reconciliation-worker";

// These tests create real deals, candidates and accounts. They only run against a disposable database whose name contains "test", never against the development or staging database.
const skip = /\/[^/?]*test[^/?]*(\?|$)/i.test(process.env.DATABASE_URL ?? "") ? false : "needs a disposable DATABASE_URL (name contains 'test')";
test("M12.1 Security: Telegram Webhook Route authenticates secret-token and rejects invalid callers", async () => {
  const { POST } = await import("@/app/api/telegram/webhook/route");

  // Missing secret header -> 401
  const req1 = new Request("http://localhost/api/telegram/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const res1 = await POST(req1);
  assert.equal(res1.status, 401);

  // Invalid secret -> 401
  const req2 = new Request("http://localhost/api/telegram/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-telegram-bot-api-secret-token": "wrong-secret",
    },
    body: JSON.stringify({}),
  });
  const res2 = await POST(req2);
  assert.equal(res2.status, 401);
});

test("M12.1 Security: Redis-backed distributed replay protection prevents duplicate callback execution", async () => {
  const testSignature = `test_sig_${Date.now()}_${Math.random()}`;

  // First consumption: success
  const first = await SharedSecurityStore.claimTelegramCallback(testSignature, 60);
  assert.equal(first, true, "First consumption must succeed");

  // Second consumption: replay blocked
  const second = await SharedSecurityStore.claimTelegramCallback(testSignature, 60);
  assert.equal(second, false, "Replayed signature must be rejected");
});

test("M12.1 Security: Persistent Shared Kill Switch across instances blocks publishing immediately", async () => {
  // Ensure inactive initially
  await Agent2PublishingEngine.setKillSwitch(false);
  assert.equal(await Agent2PublishingEngine.isKillSwitchActive(), false);

  // Activate kill switch
  await Agent2PublishingEngine.setKillSwitch(true);
  assert.equal(await Agent2PublishingEngine.isKillSwitchActive(), true);

  // Attempt publishing with kill switch active -> blocked
  const result = await Agent2PublishingEngine.publishCandidate({
    candidateId: "non_existent_killswitch_test",
    authorizationToken: "some_token",
    callerIdentity: { role: "ADMIN", userId: "admin-1" },
  });
  assert.equal(result.published, false);
  assert.match(result.error ?? "", /KILL_SWITCH_ACTIVE/);

  // Reset kill switch
  await Agent2PublishingEngine.setKillSwitch(false);
  assert.equal(await Agent2PublishingEngine.isKillSwitchActive(), false);
});

test("M12.1 Security: Atomic Claiming prevents concurrent duplicate deal publication", { skip }, async () => {
  const db = getDatabase();
  const candidateId = `cand_concurrent_${Date.now()}`;
  const token = `token_${Date.now()}`;

  // Publishing attribution requires an active Super Admin, even in isolated tests.
  await db.user.create({
    data: {
      email: `publisher-${Date.now()}@example.invalid`,
      role: "SUPER_ADMIN",
      status: "ACTIVE",
    },
  });

  // Create test candidate and authorization in APPROVED state
  await db.dealCandidate.create({
    data: {
      id: candidateId,
      sourcePlatform: "amazon",
      sourceUrl: `https://amazon.in/dp/B0TEST_${Date.now()}`,
      externalId: `ASIN_${Date.now()}`,
      rawTitle: "Concurrent Test Product",
      categorySlug: "electronics",
      observedPriceMinor: 50000,
      observedMrpMinor: 100000,
      discountPercent: 50,
      confidenceScore: 95,
      status: "VERIFIED",
    },
  });

  const auth = await db.publicationAuthorization.create({
    data: {
      candidateId,
      approvalToken: token,
      status: "APPROVED",
      confidenceScore: 0.95,
      attractivenessScore: 0.9,
      expiresAt: new Date(Date.now() + 600000),
    },
  });

  // Launch two concurrent publishing requests simultaneously
  const [res1, res2] = await Promise.all([
    Agent2PublishingEngine.publishCandidate({
      candidateId,
      authorizationToken: token,
      callerIdentity: { role: "ADMIN", userId: "admin-worker-1" },
    }),
    Agent2PublishingEngine.publishCandidate({
      candidateId,
      authorizationToken: token,
      callerIdentity: { role: "ADMIN", userId: "admin-worker-2" },
    }),
  ]);

  // Exactly one request must claim the authorization; the other must be rejected
  const successes = [res1, res2].filter((r) => r.published);
  const rejections = [res1, res2].filter((r) => !r.published);

  assert.equal(successes.length, 1, "Exactly one publishing request must succeed");
  assert.equal(rejections.length, 1, "The concurrent duplicate request must be rejected");
  assert.match(rejections[0].error ?? "", /INVALID_AUTH_STATUS/);

  // Verify final database state is PUBLISHED
  const updatedAuth = await db.publicationAuthorization.findUnique({
    where: { id: auth.id },
  });
  assert.equal(updatedAuth?.status, "PUBLISHED");
});

test("M12.1 Security: Crash Recovery Worker reconciles interrupted publishing states safely", { skip }, async () => {
  const db = getDatabase();
  const candidateId = `cand_recovery_${Date.now()}`;
  const token = `token_rec_${Date.now()}`;

  // Scenario: Process was interrupted while in PUBLISHING state, but no deal was created
  const staleAuth = await db.publicationAuthorization.create({
    data: {
      candidateId,
      approvalToken: token,
      status: "PUBLISHING",
      confidenceScore: 0.9,
      attractivenessScore: 0.85,
      expiresAt: new Date(Date.now() + 600000),
      createdAt: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
    },
  });

  // Run reconciliation
  const result = await PublishingReconciliationWorker.reconcileStaleAuthorizations(5 * 60 * 1000);
  assert.ok(result.scanned >= 1);

  const reconciledAuth = await db.publicationAuthorization.findUnique({
    where: { id: staleAuth.id },
  });
  assert.equal(reconciledAuth?.status, "RECOVERY_REQUIRED", "Stale interrupted authorization must transition to RECOVERY_REQUIRED");
});

test.after(async () => {
  const redis = getSharedRedis();
  if (redis) {
    try {
      await redis.quit();
    } catch {}
  }
  const { disconnectDatabase } = await import("@/server/db/client");
  await disconnectDatabase();
});
