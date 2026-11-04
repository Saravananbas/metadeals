import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getDatabase, disconnectDatabase } from "../src/server/db/client";
import { hashPassword, createTotpSecret, encryptTotpSecret, createRecoveryCodes, hashRecoveryCode } from "../src/server/auth/crypto";
import { getAuthEnv } from "../src/config/env";

const base = "http://localhost:4123";

async function main() {
  console.log("=== Starting Focused Scraper Dashboard Verification ===");
  const db = getDatabase();
  const env = getAuthEnv();
  const testId = randomUUID().slice(0, 8);
  const testEmail = `admin-dash-${testId}@test.invalid`;
  const tempPassword = `P@ssword123-${testId}`;
  let tempUserId: string | null = null;
  const cleanupJobIds: string[] = [];
  const cleanupCandidateIds: string[] = [];

  try {
    // Check 1 & 2: Unauthenticated access must redirect to /admin/login
    console.log("Check 1 & 2: Verifying unauthenticated access protection...");
    const unauthRes = await fetch(`${base}/admin/scraper`, { redirect: "manual" });
    assert.ok(
      [302, 307].includes(unauthRes.status),
      `Unauthenticated access should redirect (received ${unauthRes.status})`
    );
    const location = unauthRes.headers.get("location");
    assert.ok(location?.includes("/admin/login"), `Should redirect to /admin/login, got: ${location}`);
    console.log("✓ Unauthenticated access protected: correctly redirected to /admin/login");

    // Authenticate as Admin
    console.log("Creating temporary admin user...");
    const tempPassword = `Admin-${testId}-aA7!`;
    const tempRecovery = createRecoveryCodes(1)[0];
    const user = await db.user.create({
      data: {
        email: testEmail,
        passwordHash: await hashPassword(tempPassword),
        role: "SUPER_ADMIN",
        status: "ACTIVE",
        totpEnabledAt: new Date(),
        totpSecretEncrypted: encryptTotpSecret(createTotpSecret(), env.AUTH_TOTP_ENCRYPTION_KEY),
        recoveryCodes: {
          create: [{ codeHash: hashRecoveryCode(tempRecovery, env.AUTH_SESSION_SECRET) }],
        },
      },
    });
    tempUserId = user.id;

    // Login
    const loginRes = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: base },
      body: JSON.stringify({ email: testEmail, password: tempPassword, mfaCode: tempRecovery }),
    });
    assert.equal(loginRes.status, 200, "Login must succeed");
    const rawCookie = loginRes.headers.get("set-cookie");
    assert.ok(rawCookie, "Must set session cookie");
    const sessionCookie = rawCookie.split(";")[0];

    // Check 1 (cont): Authenticated access to /admin/scraper
    console.log("Verifying authenticated access to /admin/scraper...");
    const pageRes = await fetch(`${base}/admin/scraper`, {
      headers: { Cookie: sessionCookie },
    });
    assert.equal(pageRes.status, 200, "Dashboard page must load with 200 OK");
    const pageHtml = await pageRes.text();
    assert.ok(pageHtml.includes("Deal Scraper &amp; Intelligence") || pageHtml.includes("Deal Scraper"), "Page should contain title");
    assert.ok(pageHtml.includes("Account administration"), "Page should contain admin navigation");
    console.log("✓ Authenticated dashboard page loaded with 200 OK and navigation header.");

    // Check 3: Retrieve Metrics API
    console.log("Check 3: Querying GET /api/v1/admin/scraper/metrics...");
    const metricsRes = await fetch(`${base}/api/v1/admin/scraper/metrics`, {
      headers: { Cookie: sessionCookie, Origin: base },
    });
    assert.equal(metricsRes.status, 200, "Metrics endpoint must return 200");
    const metricsJson = await metricsRes.json();
    assert.ok(typeof metricsJson.data.totalCandidates === "number");
    assert.ok(typeof metricsJson.data.publishedDeals === "number");
    assert.ok(typeof metricsJson.data.pendingReview === "number");
    assert.ok(typeof metricsJson.data.rejectedCandidates === "number");
    assert.ok(Array.isArray(metricsJson.data.connectors));
    assert.ok(metricsJson.data.connectors.length >= 3, "At least 3 connectors expected");
    console.log(`✓ Metrics retrieved: Total=${metricsJson.data.totalCandidates}, Published=${metricsJson.data.publishedDeals}, Review=${metricsJson.data.pendingReview}, Connectors=${metricsJson.data.connectors.length}`);

    // Check 4: Connector Selection & Scan Submission
    console.log("Check 4: Testing POST /api/v1/admin/scraper/scan with connector 'amazon-deals'...");
    const scanRes = await fetch(`${base}/api/v1/admin/scraper/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: sessionCookie, Origin: base },
      body: JSON.stringify({ connectorCode: "amazon-deals" }),
    });
    assert.equal(scanRes.status, 200, "Scan submission must return 200");
    const scanJson = await scanRes.json();
    cleanupJobIds.push(scanJson.data.id);
    assert.equal(scanJson.data.status, "COMPLETED", "Scan job should complete");
    assert.ok(scanJson.data.itemsFound >= 2, "Items should be found");
    console.log(`✓ Scan executed successfully: Job ID=${scanJson.data.id}, Items Found=${scanJson.data.itemsFound}, Items Published=${scanJson.data.itemsPublished}`);

    // Check 5: Candidate Listing API with pagination & filtering
    console.log("Check 5: Querying GET /api/v1/admin/scraper/candidates...");
    const candidatesRes = await fetch(`${base}/api/v1/admin/scraper/candidates?limit=10&offset=0`, {
      headers: { Cookie: sessionCookie, Origin: base },
    });
    assert.equal(candidatesRes.status, 200, "Candidates endpoint must return 200");
    const candidatesJson = await candidatesRes.json();
    assert.ok(Array.isArray(candidatesJson.data.items), "Items must be an array");
    assert.ok(typeof candidatesJson.data.total === "number", "Total must be a number");
    console.log(`✓ Candidates listed: Returned ${candidatesJson.data.items.length} items (Total in DB: ${candidatesJson.data.total})`);

    // Check 6: Review actions API (Approve / Reject)
    console.log("Check 6: Testing manual review workflow on an uncertain candidate...");
    // Create an isolated uncertain candidate
    const testCandidate = await db.dealCandidate.create({
      data: {
        sourceUrl: `https://www.croma.com/test-review-item-${testId}`,
        sourcePlatform: "croma",
        externalId: `ext-${testId}`,
        rawTitle: `Test Product for Review ${testId}`,
        brand: "TestBrand",
        categorySlug: "electronics",
        observedPriceMinor: 100000, // ₹1,000
        observedMrpMinor: 1000000, // ₹10,000 (90% discount -> triggers Gate B uncertain)
        currency: "INR",
        discountPercent: 90,
        status: "UNCERTAIN",
        rejectionReason: "Extreme discount of 90% exceeds 85% threshold (probable price error)",
        confidenceScore: 30,
      },
    });
    cleanupCandidateIds.push(testCandidate.id);

    // Approve the candidate
    console.log(`Approving candidate ${testCandidate.id}...`);
    const approveRes = await fetch(`${base}/api/v1/admin/scraper/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: sessionCookie, Origin: base },
      body: JSON.stringify({ candidateId: testCandidate.id, action: "APPROVE" }),
    });
    assert.equal(approveRes.status, 200, "Approve action must return 200");
    const approveJson = await approveRes.json();
    assert.equal(approveJson.data.status, "APPROVED_AND_PUBLISHED");
    assert.ok(approveJson.data.deal?.id, "Published deal must be returned");
    console.log(`✓ Candidate approved and published as Deal ID: ${approveJson.data.deal.id}`);

    // Create a second uncertain candidate to test rejection
    const rejectCandidate = await db.dealCandidate.create({
      data: {
        sourceUrl: `https://www.croma.com/test-reject-item-${testId}`,
        sourcePlatform: "croma",
        externalId: `ext-rej-${testId}`,
        rawTitle: `Test Glitch Deal ${testId}`,
        brand: "TestBrand",
        categorySlug: "electronics",
        observedPriceMinor: 50000, // ₹500
        observedMrpMinor: 500000,  // ₹5,000
        currency: "INR",
        discountPercent: 90,
        status: "UNCERTAIN",
        rejectionReason: "Extreme discount of 90% exceeds 85% threshold",
        confidenceScore: 25,
      },
    });
    cleanupCandidateIds.push(rejectCandidate.id);

    console.log(`Rejecting candidate ${rejectCandidate.id}...`);
    const rejectRes = await fetch(`${base}/api/v1/admin/scraper/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: sessionCookie, Origin: base },
      body: JSON.stringify({
        candidateId: rejectCandidate.id,
        action: "REJECT",
        reason: "Glitch price confirmed by admin review.",
      }),
    });
    assert.equal(rejectRes.status, 200, "Reject action must return 200");
    const rejectJson = await rejectRes.json();
    assert.equal(rejectJson.data.status, "REJECTED");
    assert.equal(rejectJson.data.candidate.status, "REJECTED");
    assert.equal(rejectJson.data.candidate.rejectionReason, "Glitch price confirmed by admin review.");
    console.log("✓ Candidate successfully rejected with admin reason recorded.");

    console.log("=== All 6 Focused Scraper Dashboard Checks Passed! ===");
  } finally {
    // Cleanup test records
    console.log("Cleaning up test data...");
    if (cleanupCandidateIds.length > 0) {
      const candidates = await db.dealCandidate.findMany({
        where: { id: { in: cleanupCandidateIds } },
        select: { dealId: true },
      });
      const dealIds = candidates.map((c) => c.dealId).filter(Boolean) as string[];
      if (dealIds.length > 0) {
        await db.deal.deleteMany({ where: { id: { in: dealIds } } });
      }
      await db.priceObservation.deleteMany({ where: { candidateId: { in: cleanupCandidateIds } } });
      await db.dealCandidate.deleteMany({ where: { id: { in: cleanupCandidateIds } } });
    }
    if (cleanupJobIds.length > 0) {
      await db.scraperJob.deleteMany({ where: { id: { in: cleanupJobIds } } });
    }
    if (tempUserId) {
      await db.recoveryCode.deleteMany({ where: { userId: tempUserId } });
      await db.authSession.deleteMany({ where: { userId: tempUserId } });
      await db.user.delete({ where: { id: tempUserId } });
    }
    await disconnectDatabase();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

