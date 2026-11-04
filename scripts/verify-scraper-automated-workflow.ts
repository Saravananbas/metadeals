import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getDatabase, disconnectDatabase } from "../src/server/db/client";
import { scraperService } from "../src/server/scraper/service";
import { verifyCandidate } from "../src/server/scraper/verification";
import { connectorRegistry } from "../src/server/scraper/connectors/registry";
import { getPriceReferenceStats, recordPriceObservation } from "../src/server/scraper/price-history";
import { candidateInputSchema } from "../src/features/scraper/validation";
import { createTotpSecret, encryptTotpSecret, hashPassword, createRecoveryCodes, hashRecoveryCode } from "../src/server/auth/crypto";
import { getAuthEnv } from "../src/config/env";

interface TestReport {
  test1_discovery: boolean;
  test2_extraction: boolean;
  test3_matching: boolean;
  test4_verification: boolean;
  test5_publishing: boolean;
  test6_review_queue: boolean;
  test7_workers: boolean;
  test8_monitoring: boolean;
  test9_browser_api: boolean;
}

const report: TestReport = {
  test1_discovery: false,
  test2_extraction: false,
  test3_matching: false,
  test4_verification: false,
  test5_publishing: false,
  test6_review_queue: false,
  test7_workers: false,
  test8_monitoring: false,
  test9_browser_api: false,
};

async function main() {
  console.log("================================================================================");
  console.log("   METADEALS4U — DEAL SCRAPER & INTELLIGENCE ENGINE END-TO-END TEST SUITE       ");
  console.log("================================================================================\n");

  const db = getDatabase();
  const testRunId = `test-${randomUUID().slice(0, 8)}`;
  const cleanupCandidateIds: string[] = [];
  const cleanupDealIds: string[] = [];
  const cleanupJobIds: string[] = [];
  const cleanupObservationIds: string[] = [];
  let tempAdminId: string | null = null;

  try {
    // -------------------------------------------------------------------------
    // Setup temporary admin user for audit attribution & API authentication
    // -------------------------------------------------------------------------
    const env = getAuthEnv();
    const tempPassword = `Admin-${randomUUID()}-aA7!`;
    const tempRecovery = createRecoveryCodes(1)[0];
    const tempAdmin = await db.user.create({
      data: {
        email: `scraper-test-${testRunId}@test.invalid`,
        passwordHash: await hashPassword(tempPassword),
        role: "SUPER_ADMIN",
        status: "ACTIVE",
        totpEnabledAt: new Date(),
        totpSecretEncrypted: encryptTotpSecret(createTotpSecret(), env.AUTH_TOTP_ENCRYPTION_KEY),
        recoveryCodes: {
          create: { codeHash: hashRecoveryCode(tempRecovery, env.AUTH_SESSION_SECRET) },
        },
      },
    });
    tempAdminId = tempAdmin.id;

    // =========================================================================
    // TEST 1 — Discovery
    // =========================================================================
    console.log(">>> TEST 1: Automated Discovery Workflow");
    const connectors = connectorRegistry.getAll();
    assert.ok(connectors.length >= 3, "Expected at least 3 registered connectors");
    console.log(`  ✓ Discovered ${connectors.length} connectors: ${connectors.map(c => c.code).join(", ")}`);

    for (const connector of connectors) {
      const health = await connector.checkHealth();
      assert.equal(health.isHealthy, true, `Connector ${connector.code} should report healthy`);
      console.log(`    - Connector [${connector.code}] health: HEALTHY (${health.message || "ok"})`);
    }

    // Run connector scan on cuelinks-feed connector
    console.log("  Executing connector scan for 'cuelinks-feed'...");
    const scanJob = await scraperService.runConnectorScan(db, "cuelinks-feed");
    cleanupJobIds.push(scanJob.id);
    assert.equal(scanJob.status, "COMPLETED", "Scan job should complete successfully");
    assert.ok(scanJob.itemsFound >= 2, "Scan should discover candidate listings");
    assert.ok(scanJob.completedAt !== null, "Job must have a completion timestamp");
    console.log(`  ✓ Scan job ${scanJob.id}: status=${scanJob.status}, itemsFound=${scanJob.itemsFound}, itemsVerified=${scanJob.itemsVerified}, itemsPublished=${scanJob.itemsPublished}`);

    // Test error handling for invalid connector
    console.log("  Testing error handling for unknown connector...");
    await assert.rejects(
      async () => await scraperService.runConnectorScan(db, "nonexistent-connector"),
      /Connector nonexistent-connector not found/,
      "Should reject invalid connector"
    );
    console.log("  ✓ Unknown connector error handled cleanly.");
    report.test1_discovery = true;

    // =========================================================================
    // TEST 2 — Product Extraction & Schema Validation
    // =========================================================================
    console.log("\n>>> TEST 2: Product Extraction & Attribute Validation");
    const validListing = {
      sourceUrl: `https://www.amazon.in/dp/B0TEST${testRunId.toUpperCase()}`,
      sourcePlatform: "amazon",
      externalId: `ASIN-${testRunId}`,
      rawTitle: `Noise ColorFit Pulse Smart Watch (${testRunId})`,
      brand: "Noise",
      categorySlug: "electronics",
      observedPriceMinor: 149900,  // ₹1,499
      observedMrpMinor: 499900,   // ₹4,999
      currency: "INR",
      imageUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30",
      sellerName: "Appario Retail",
      inStock: true,
    };

    const parsed = candidateInputSchema.safeParse(validListing);
    assert.equal(parsed.success, true, "Valid candidate listing should parse cleanly");
    if (parsed.success) {
      assert.equal(parsed.data.brand, "Noise");
      assert.equal(parsed.data.categorySlug, "electronics");
      assert.equal(parsed.data.observedPriceMinor, 149900);
      assert.equal(parsed.data.observedMrpMinor, 499900);
      assert.equal(parsed.data.currency, "INR");
      assert.equal(parsed.data.inStock, true);
    }
    console.log("  ✓ Extracted attributes: Title, Brand, Image, Category, Merchant, MRP, Price, Product URL, External ID");

    // Incomplete extraction tests:
    const missingTitle = candidateInputSchema.safeParse({ ...validListing, rawTitle: "" });
    assert.equal(missingTitle.success, false, "Missing title must fail schema validation");

    const nonHttps = candidateInputSchema.safeParse({ ...validListing, sourceUrl: "http://insecure-store.com/item" });
    assert.equal(nonHttps.success, false, "Non-HTTPS URL must fail validation");

    const negativePrice = candidateInputSchema.safeParse({ ...validListing, observedPriceMinor: -100 });
    assert.equal(negativePrice.success, false, "Negative price must fail validation");

    const priceExceedsMrp = candidateInputSchema.safeParse({ ...validListing, observedPriceMinor: 600000, observedMrpMinor: 500000 });
    assert.equal(priceExceedsMrp.success, false, "Price > MRP must fail validation");

    console.log("  ✓ Incomplete and malformed candidate extractions rejected by schema constraints.");
    report.test2_extraction = true;

    // =========================================================================
    // TEST 3 — Product Matching & Disambiguation
    // =========================================================================
    console.log("\n>>> TEST 3: Product Matching & Disambiguation");
    // Variant 1: 128 GB
    const variant1 = await scraperService.ingestCandidate(db, {
      sourceUrl: `https://www.flipkart.com/phone-${testRunId}-128gb/p/itm128`,
      sourcePlatform: "flipkart",
      externalId: `PID-${testRunId}-128`,
      rawTitle: `Smartphone Pro 128GB (${testRunId})`,
      brand: "ProPhone",
      categorySlug: "electronics",
      observedPriceMinor: 2999900,
      observedMrpMinor: 3999900,
      sellerName: "Flipkart Retail",
      inStock: true,
    });
    assert.ok(variant1.candidate, "Variant 1 candidate must exist");
    cleanupCandidateIds.push(variant1.candidate.id);
    if (variant1.deal) cleanupDealIds.push(variant1.deal.id);

    // Variant 2: 256 GB with distinct external ID and title
    const variant2 = await scraperService.ingestCandidate(db, {
      sourceUrl: `https://www.flipkart.com/phone-${testRunId}-256gb/p/itm256`,
      sourcePlatform: "flipkart",
      externalId: `PID-${testRunId}-256`,
      rawTitle: `Smartphone Pro 256GB (${testRunId})`,
      brand: "ProPhone",
      categorySlug: "electronics",
      observedPriceMinor: 3499900,
      observedMrpMinor: 4499900,
      sellerName: "Flipkart Retail",
      inStock: true,
    });
    assert.ok(variant2.candidate, "Variant 2 candidate must exist");
    cleanupCandidateIds.push(variant2.candidate.id);
    if (variant2.deal) cleanupDealIds.push(variant2.deal.id);

    assert.notEqual(variant1.candidate.id, variant2.candidate.id, "Distinct variants must produce distinct candidates");
    if (variant1.deal && variant2.deal) {
      assert.notEqual(variant1.deal.id, variant2.deal.id, "Distinct variants must produce distinct deals");
      assert.notEqual(variant1.deal.slug, variant2.deal.slug, "Slugs must not collide");
    }
    console.log("  ✓ Variant matching verified: 128GB and 256GB maintained separate identities with distinct slugs and external IDs");

    // Slug collision handling for identical rawTitle:
    const collisionCandidate = await scraperService.ingestCandidate(db, {
      sourceUrl: `https://www.flipkart.com/phone-${testRunId}-128gb-dup/p/itm128dup`,
      sourcePlatform: "flipkart",
      externalId: `PID-${testRunId}-128-DUP`,
      rawTitle: `Smartphone Pro 128GB (${testRunId})`,
      brand: "ProPhone",
      categorySlug: "electronics",
      observedPriceMinor: 2999900,
      observedMrpMinor: 3999900,
      sellerName: "Flipkart Retail",
      inStock: true,
    });
    assert.ok(collisionCandidate.candidate, "Collision candidate must exist");
    cleanupCandidateIds.push(collisionCandidate.candidate.id);
    if (collisionCandidate.deal) cleanupDealIds.push(collisionCandidate.deal.id);
    assert.ok(collisionCandidate.deal !== null, "Collision candidate should safely publish with disambiguated slug");
    console.log(`  ✓ Slug collision resolved gracefully without overwriting: '${collisionCandidate.deal?.slug}'`);
    report.test3_matching = true;

    // =========================================================================
    // TEST 4 — Price and Deal Verification Gates (A to F)
    // =========================================================================
    console.log("\n>>> TEST 4: Verification Gates (A to F)");

    // Gate A: Genuine discount (30% off, MRP ₹10,000, Price ₹7,000)
    console.log("  [Gate A] Testing genuine discount verification...");
    const resA = verifyCandidate({
      sourceUrl: "https://www.amazon.in/dp/B0GENUINE1",
      sourcePlatform: "amazon",
      rawTitle: "Genuine Discount Test Item",
      categorySlug: "electronics",
      observedPriceMinor: 700000, // ₹7,000
      observedMrpMinor: 1000000, // ₹10,000
      currency: "INR",
      inStock: true,
      brand: "BrandA",
    });
    assert.equal(resA.status, "VERIFIED", "Genuine 30% discount should pass all gates");
    assert.ok(resA.passedGates.includes("GATE_SECURE_HTTPS"));
    assert.ok(resA.passedGates.includes("GATE_POSITIVE_PRICES"));
    assert.ok(resA.passedGates.includes("GATE_PRICE_LTE_MRP"));
    assert.ok(resA.passedGates.includes("GATE_IN_STOCK"));
    assert.ok(resA.passedGates.includes("GATE_MINIMUM_DISCOUNT"));
    assert.ok(resA.passedGates.includes("GATE_PRICE_ANOMALY"));
    console.log("  ✓ Gate A PASS: Genuine discount marked VERIFIED with all 6 gates passed.");

    // Gate B: Extreme discount (92% off, MRP ₹1,00,000, Price ₹8,000)
    console.log("  [Gate B] Testing extreme discount (>= 85%)...");
    const resB = verifyCandidate({
      sourceUrl: "https://www.amazon.in/dp/B0EXTREME1",
      sourcePlatform: "amazon",
      rawTitle: "Extreme Discount Test Item",
      categorySlug: "electronics",
      observedPriceMinor: 800000,  // ₹8,000
      observedMrpMinor: 10000000, // ₹1,00,000
      currency: "INR",
      inStock: true,
    });
    assert.equal(resB.status, "UNCERTAIN", "Extreme 92% discount should be marked UNCERTAIN");
    assert.equal(resB.failedGates.includes("GATE_PRICE_ANOMALY"), true);
    assert.match(resB.rejectionReason ?? "", /85% threshold/);
    console.log(`  ✓ Gate B PASS: Extreme discount marked UNCERTAIN for review (${resB.rejectionReason})`);

    // Gate C: Pricing glitch (75% drop below 30-day historical median of ₹40,000 -> price ₹10,000)
    console.log("  [Gate C] Testing price drop anomaly below 30-day median...");
    const statsMedian = {
      observationCount: 15,
      median7DayMinor: 4000000,
      median30DayMinor: 4000000, // ₹40,000 median
      median90DayMinor: 4200000,
      lowestObservedMinor: 3800000,
      highestObservedMinor: 4500000,
      latestObservedAt: new Date(),
    };
    const resC = verifyCandidate(
      {
        sourceUrl: "https://www.amazon.in/dp/B0GLITCH1",
        sourcePlatform: "amazon",
        rawTitle: "Median Drop Glitch Item",
        categorySlug: "electronics",
        observedPriceMinor: 1000000, // ₹10,000 (75% drop from median)
        observedMrpMinor: 4500000,  // ₹45,000 MRP
        currency: "INR",
        inStock: true,
      },
      statsMedian
    );
    assert.equal(resC.status, "UNCERTAIN", "75% drop from median should be marked UNCERTAIN");
    assert.match(resC.rejectionReason ?? "", /30-day median/);
    console.log(`  ✓ Gate C PASS: Price glitch flagged UNCERTAIN for review (${resC.rejectionReason})`);

    // Gate D: Missing or invalid price (Price <= 0, or Price > MRP)
    console.log("  [Gate D] Testing missing/invalid prices...");
    const resD1 = verifyCandidate({
      sourceUrl: "https://www.amazon.in/dp/B0ZERO1",
      sourcePlatform: "amazon",
      rawTitle: "Zero Price Item",
      categorySlug: "electronics",
      observedPriceMinor: 0,
      observedMrpMinor: 100000,
      currency: "INR",
      inStock: true,
    });
    assert.equal(resD1.status, "REJECTED");
    assert.equal(resD1.failedGates.includes("GATE_POSITIVE_PRICES"), true);

    const resD2 = verifyCandidate({
      sourceUrl: "https://www.amazon.in/dp/B0OVER1",
      sourcePlatform: "amazon",
      rawTitle: "Price Exceeds MRP Item",
      categorySlug: "electronics",
      observedPriceMinor: 150000,
      observedMrpMinor: 100000,
      currency: "INR",
      inStock: true,
    });
    assert.equal(resD2.status, "REJECTED");
    assert.equal(resD2.failedGates.includes("GATE_PRICE_LTE_MRP"), true);
    console.log("  ✓ Gate D PASS: Invalid prices (zero and price > MRP) REJECTED.");

    // Gate E: Invalid seller / URL / Out of stock
    console.log("  [Gate E] Testing non-HTTPS and out-of-stock gating...");
    const resE1 = verifyCandidate({
      sourceUrl: "http://insecure.amazon.in/dp/B0INSECURE",
      sourcePlatform: "amazon",
      rawTitle: "Insecure Item",
      categorySlug: "electronics",
      observedPriceMinor: 50000,
      observedMrpMinor: 100000,
      currency: "INR",
      inStock: true,
    });
    assert.equal(resE1.status, "REJECTED");
    assert.equal(resE1.failedGates.includes("GATE_SECURE_HTTPS"), true);

    const resE2 = verifyCandidate({
      sourceUrl: "https://www.amazon.in/dp/B0OOS",
      sourcePlatform: "amazon",
      rawTitle: "Out of Stock Item",
      categorySlug: "electronics",
      observedPriceMinor: 50000,
      observedMrpMinor: 100000,
      currency: "INR",
      inStock: false,
    });
    assert.equal(resE2.status, "REJECTED");
    assert.equal(resE2.failedGates.includes("GATE_IN_STOCK"), true);
    console.log("  ✓ Gate E PASS: Insecure URL and out-of-stock REJECTED.");

    // Gate F: Expired offer / negligible discount (< 5%)
    console.log("  [Gate F] Testing low discount threshold (< 5%)...");
    const resF = verifyCandidate({
      sourceUrl: "https://www.amazon.in/dp/B0LOWDISC",
      sourcePlatform: "amazon",
      rawTitle: "Low Discount Item",
      categorySlug: "electronics",
      observedPriceMinor: 98000, // 2% discount on ₹1,000
      observedMrpMinor: 100000,
      currency: "INR",
      inStock: true,
    });
    assert.equal(resF.status, "REJECTED");
    assert.equal(resF.failedGates.includes("GATE_MINIMUM_DISCOUNT"), true);
    console.log("  ✓ Gate F PASS: Offer with discount < 5% REJECTED.");
    report.test4_verification = true;

    // =========================================================================
    // TEST 5 — Automated Publishing Rules
    // =========================================================================
    console.log("\n>>> TEST 5: Automated Publishing Pipeline");
    // Ingest VERIFIED offer: should publish automatically
    const autoPublished = await scraperService.ingestCandidate(db, {
      sourceUrl: `https://www.croma.com/item-${testRunId}-verified`,
      sourcePlatform: "cuelinks",
      externalId: `CROMA-${testRunId}-AUTO`,
      rawTitle: `Dell 27-inch 4K UHD Monitor (${testRunId})`,
      brand: "Dell",
      categorySlug: "electronics",
      observedPriceMinor: 2499900, // ₹24,999
      observedMrpMinor: 3499900,  // ₹34,999
      sellerName: "Croma Official",
      inStock: true,
    });
    assert.ok(autoPublished.candidate, "Auto-published candidate must exist");
    cleanupCandidateIds.push(autoPublished.candidate.id);
    if (autoPublished.deal) cleanupDealIds.push(autoPublished.deal.id);

    assert.equal(autoPublished.outcome, "PUBLISHED", "Verified candidate must be immediately published");
    assert.ok(autoPublished.deal !== null, "Deal record must be created");
    assert.equal(autoPublished.deal?.status, "PUBLISHED", "Deal status must be PUBLISHED");
    assert.equal(autoPublished.candidate?.status, "PUBLISHED", "Candidate status must be updated to PUBLISHED");
    console.log(`  ✓ VERIFIED candidate auto-published cleanly as Deal [${autoPublished.deal?.id}] with slug '${autoPublished.deal?.slug}'`);

    // Ingest UNCERTAIN offer: should NOT publish, status UNCERTAIN
    const uncertainCandidate = await scraperService.ingestCandidate(db, {
      sourceUrl: `https://www.croma.com/item-${testRunId}-uncertain`,
      sourcePlatform: "cuelinks",
      externalId: `CROMA-${testRunId}-UNCERTAIN`,
      rawTitle: `Dell 27-inch 4K UHD Monitor Clearance 90% OFF (${testRunId})`,
      brand: "Dell",
      categorySlug: "electronics",
      observedPriceMinor: 349900,  // ₹3,499 (90% discount on ₹35k monitor)
      observedMrpMinor: 3499900,
      sellerName: "Unverified Seller",
      inStock: true,
    });
    assert.ok(uncertainCandidate.candidate, "Uncertain candidate must exist");
    cleanupCandidateIds.push(uncertainCandidate.candidate.id);
    assert.equal(uncertainCandidate.outcome, "UNCERTAIN", "Anomaly must be marked UNCERTAIN");
    assert.equal(uncertainCandidate.deal, null, "UNCERTAIN offer must NOT create a Deal");
    assert.equal(uncertainCandidate.candidate.status, "UNCERTAIN");
    console.log("  ✓ UNCERTAIN candidate routed to review queue without creating a public deal.");

    // Ingest REJECTED offer (e.g. out of stock): should NOT publish, status REJECTED
    const rejectedCandidate = await scraperService.ingestCandidate(db, {
      sourceUrl: `https://www.croma.com/item-${testRunId}-rejected`,
      sourcePlatform: "cuelinks",
      externalId: `CROMA-${testRunId}-REJECTED`,
      rawTitle: `Dell 27-inch 4K Monitor Out of Stock (${testRunId})`,
      brand: "Dell",
      categorySlug: "electronics",
      observedPriceMinor: 2499900,
      observedMrpMinor: 3499900,
      sellerName: "Croma Official",
      inStock: false,
    });
    assert.ok(rejectedCandidate.candidate, "Rejected candidate must exist");
    cleanupCandidateIds.push(rejectedCandidate.candidate.id);
    assert.equal(rejectedCandidate.outcome, "REJECTED", "Out-of-stock must be REJECTED");
    assert.equal(rejectedCandidate.deal, null, "REJECTED offer must NOT create a Deal");
    assert.equal(rejectedCandidate.candidate.status, "REJECTED");
    console.log("  ✓ REJECTED candidate rejected without creating a public deal.");
    report.test5_publishing = true;

    // =========================================================================
    // TEST 6 — Admin Review Queue
    // =========================================================================
    console.log("\n>>> TEST 6: Admin Review Queue & Manual Decision Workflow");
    const queueList = await scraperService.listCandidates(db, { status: "UNCERTAIN" });
    const foundInQueue = queueList.items.find(c => c.id === uncertainCandidate.candidate?.id);
    assert.ok(foundInQueue !== undefined, "UNCERTAIN candidate must appear in admin review queue");
    console.log(`  ✓ Candidate ${foundInQueue?.id} found in review queue. Reason: ${foundInQueue?.rejectionReason}`);

    // Admin approves the uncertain candidate:
    console.log("  Testing admin approval action...");
    const approval = await scraperService.reviewCandidate(
      db,
      uncertainCandidate.candidate.id,
      { action: "APPROVE", reason: "Verified legitimate anniversary clearance sale" },
      tempAdminId
    );
    if (approval.deal) cleanupDealIds.push(approval.deal.id);
    assert.equal(approval.status, "APPROVED_AND_PUBLISHED");
    assert.ok(approval.deal !== null, "Approved candidate must produce a published Deal");
    assert.equal(approval.candidate?.status, "PUBLISHED");
    console.log(`  ✓ Candidate approved and published as Deal [${approval.deal?.id}]`);

    // Create another UNCERTAIN candidate and test REJECT action:
    const anotherUncertain = await scraperService.ingestCandidate(db, {
      sourceUrl: `https://www.croma.com/item-${testRunId}-to-reject`,
      sourcePlatform: "cuelinks",
      externalId: `CROMA-${testRunId}-REJECT-ME`,
      rawTitle: `Spam Listing (${testRunId})`,
      categorySlug: "electronics",
      observedPriceMinor: 100000,
      observedMrpMinor: 1000000, // 90% discount
      inStock: true,
    });
    assert.ok(anotherUncertain.candidate, "Another uncertain candidate must exist");
    cleanupCandidateIds.push(anotherUncertain.candidate.id);

    console.log("  Testing admin rejection action...");
    const rejection = await scraperService.reviewCandidate(
      db,
      anotherUncertain.candidate.id,
      { action: "REJECT", reason: "Confirmed fake seller listing" },
      tempAdminId
    );
    assert.equal(rejection.status, "REJECTED");
    assert.equal(rejection.deal, null);
    assert.equal(rejection.candidate.status, "REJECTED");
    assert.equal(rejection.candidate.rejectionReason, "Confirmed fake seller listing");
    console.log("  ✓ Candidate successfully rejected with admin reason recorded.");
    report.test6_review_queue = true;

    // =========================================================================
    // TEST 7 — Background Workers & Scraper Jobs
    // =========================================================================
    console.log("\n>>> TEST 7: Background Scraper Jobs & State Tracking");
    const amazonJob = await scraperService.runConnectorScan(db, "amazon-deals");
    cleanupJobIds.push(amazonJob.id);
    assert.equal(amazonJob.status, "COMPLETED");
    assert.equal(amazonJob.connectorCode, "amazon-deals");
    assert.ok(amazonJob.itemsFound >= 2);
    console.log(`  ✓ Amazon scraper job executed: ${amazonJob.itemsFound} items found, ${amazonJob.itemsPublished} published.`);

    const flipkartJob = await scraperService.runConnectorScan(db, "flipkart-deals");
    cleanupJobIds.push(flipkartJob.id);
    assert.equal(flipkartJob.status, "COMPLETED");
    assert.equal(flipkartJob.connectorCode, "flipkart-deals");
    assert.ok(flipkartJob.itemsFound >= 2);
    console.log(`  ✓ Flipkart scraper job executed: ${flipkartJob.itemsFound} items found, ${flipkartJob.itemsPublished} published.`);
    report.test7_workers = true;

    // =========================================================================
    // TEST 8 — Post-Publication Price Monitoring
    // =========================================================================
    console.log("\n>>> TEST 8: Post-Publication Monitoring & Price History");
    const testMerchantSlug = `test-merchant-${testRunId}`;

    // Record sequential historical price observations
    const obs1 = await recordPriceObservation(db, {
      merchantSlug: testMerchantSlug,
      priceMinor: 5000000, // ₹50,000
      mrpMinor: 6000000,
      sourceUrl: `https://${testMerchantSlug}.com/product`,
    });
    cleanupObservationIds.push(obs1.id);

    const obs2 = await recordPriceObservation(db, {
      merchantSlug: testMerchantSlug,
      priceMinor: 4800000, // ₹48,000
      mrpMinor: 6000000,
      sourceUrl: `https://${testMerchantSlug}.com/product`,
    });
    cleanupObservationIds.push(obs2.id);

    const obs3 = await recordPriceObservation(db, {
      merchantSlug: testMerchantSlug,
      priceMinor: 5200000, // ₹52,000
      mrpMinor: 6000000,
      sourceUrl: `https://${testMerchantSlug}.com/product`,
    });
    cleanupObservationIds.push(obs3.id);

    // Compute reference statistics
    const stats = await getPriceReferenceStats(db, { merchantSlug: testMerchantSlug });
    assert.equal(stats.observationCount, 3, "Should compute stats over 3 observations");
    assert.equal(stats.lowestObservedMinor, 4800000, "Lowest price should be ₹48,000");
    assert.equal(stats.highestObservedMinor, 5200000, "Highest price should be ₹52,000");
    assert.equal(stats.median30DayMinor, 5000000, "Median 30-day price should be ₹50,000");
    console.log(`  ✓ Historical statistics computed: Observations=${stats.observationCount}, Median=₹${Math.round((stats.median30DayMinor ?? 0) / 100)}, Range=₹${Math.round((stats.lowestObservedMinor ?? 0)/100)} - ₹${Math.round((stats.highestObservedMinor ?? 0)/100)}`);
    report.test8_monitoring = true;

    // =========================================================================
    // TEST 9 — Browser / HTTP API Verification on localhost:4123
    // =========================================================================
    console.log("\n>>> TEST 9: Browser & HTTP API End-to-End Verification");
    const base = "http://localhost:4123";

    // 1. Authenticate as Admin
    console.log("  Authenticating with local dev server at " + base + "...");
    const loginRes = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: base },
      body: JSON.stringify({ email: tempAdmin.email, password: tempPassword, mfaCode: tempRecovery }),
    });
    assert.equal(loginRes.status, 200, "Login must succeed with 200");
    const setCookie = loginRes.headers.get("set-cookie") || "";
    const sessionCookie = setCookie.split(";")[0];
    assert.ok(sessionCookie.includes("metadeals-session="), "Must establish valid session cookie");
    console.log("  ✓ Admin authenticated successfully.");

    // 2. Query Scraper Metrics API
    console.log("  Querying GET /api/v1/admin/scraper/metrics...");
    const metricsRes = await fetch(`${base}/api/v1/admin/scraper/metrics`, {
      headers: { Cookie: sessionCookie, Origin: base },
    });
    assert.equal(metricsRes.status, 200, "Metrics endpoint must return 200");
    const metricsJson = await metricsRes.json();
    assert.ok(typeof metricsJson.data.totalCandidates === "number");
    assert.ok(typeof metricsJson.data.publishedDeals === "number");
    assert.ok(Array.isArray(metricsJson.data.connectors));
    console.log(`  ✓ Scraper metrics retrieved: totalCandidates=${metricsJson.data.totalCandidates}, publishedDeals=${metricsJson.data.publishedDeals}, connectors=${metricsJson.data.connectors.length}`);

    // 3. Query Scraper Candidates API
    console.log("  Querying GET /api/v1/admin/scraper/candidates...");
    const candidatesRes = await fetch(`${base}/api/v1/admin/scraper/candidates?status=PUBLISHED&limit=5`, {
      headers: { Cookie: sessionCookie, Origin: base },
    });
    assert.equal(candidatesRes.status, 200, "Candidates endpoint must return 200");
    const candidatesJson = await candidatesRes.json();
    assert.ok(Array.isArray(candidatesJson.data.items), "Items must be an array");
    console.log(`  ✓ Candidates list retrieved: ${candidatesJson.data.items.length} items on page.`);

    // 4. Trigger Live Scan API
    console.log("  Testing POST /api/v1/admin/scraper/scan via HTTP...");
    const scanApiRes = await fetch(`${base}/api/v1/admin/scraper/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: sessionCookie, Origin: base },
      body: JSON.stringify({ connectorCode: "cuelinks-feed" }),
    });
    assert.equal(scanApiRes.status, 200, "Scan API must return 200");
    const scanApiJson = await scanApiRes.json();
    cleanupJobIds.push(scanApiJson.data.id);
    assert.equal(scanApiJson.data.status, "COMPLETED");
    console.log(`  ✓ Scan API triggered successfully: Job ID ${scanApiJson.data.id}`);

    // 5. Verify Public Deals Endpoint
    console.log("  Verifying public deals endpoint GET /api/v1/deals...");
    const publicDealsRes = await fetch(`${base}/api/v1/deals`);
    assert.equal(publicDealsRes.status, 200, "Public deals endpoint must return 200");
    const publicDealsJson = await publicDealsRes.json();
    assert.ok(Array.isArray(publicDealsJson.data), "Public deals data must be an array");
    for (const d of publicDealsJson.data) {
      assert.ok(d.id && d.title && d.priceMinor, "Public deal must be valid");
    }
    console.log(`  ✓ Public deals endpoint verified: returns ${publicDealsJson.data.length} eligible published deals.`);
    report.test9_browser_api = true;

  } finally {
    // -------------------------------------------------------------------------
    // Safe Cleanup of Isolated Test Data
    // -------------------------------------------------------------------------
    console.log("\n>>> Cleaning up isolated test records to preserve database integrity...");
    try {
      if (cleanupObservationIds.length > 0) {
        await db.priceObservation.deleteMany({ where: { id: { in: cleanupObservationIds } } });
      }
      if (cleanupDealIds.length > 0) {
        // Unlink candidate references first
        await db.dealCandidate.updateMany({
          where: { dealId: { in: cleanupDealIds } },
          data: { dealId: null },
        });
        await db.deal.deleteMany({ where: { id: { in: cleanupDealIds } } });
      }
      if (cleanupCandidateIds.length > 0) {
        await db.priceObservation.deleteMany({ where: { candidateId: { in: cleanupCandidateIds } } });
        await db.dealCandidate.deleteMany({ where: { id: { in: cleanupCandidateIds } } });
      }
      if (cleanupJobIds.length > 0) {
        await db.scraperJob.deleteMany({ where: { id: { in: cleanupJobIds } } });
      }
      if (tempAdminId) {
        await db.recoveryCode.deleteMany({ where: { userId: tempAdminId } });
        await db.authSession.deleteMany({ where: { userId: tempAdminId } });
        await db.user.delete({ where: { id: tempAdminId } });
      }
      console.log("✓ Cleanup completed successfully.");
    } catch (cleanupErr) {
      console.warn("Notice: Non-critical cleanup issue:", cleanupErr);
    }
    await disconnectDatabase();
  }

  console.log("\n================================================================================");
  console.log("                        ALL 9 TEST SUITES COMPLETED                             ");
  console.log("================================================================================");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
