import "dotenv/config";
import { getDatabase, disconnectDatabase } from "../src/server/db/client";
import { scraperService } from "../src/server/scraper/service";
import { getPriceReferenceStats } from "../src/server/scraper/price-history";

async function run() {
  console.log("--- Starting Deal Scraper & Deal Intelligence Engine Integration Test ---");
  const db = getDatabase();

  const superAdmin = await db.user.findFirst({
    where: { role: "SUPER_ADMIN", status: "ACTIVE" },
  });
  if (!superAdmin) {
    throw new Error("No super admin found for test.");
  }

  // 1. Ingest a standard verified deal candidate
  console.log("1. Ingesting a verified deal candidate...");
  const verifiedCandidate = await scraperService.ingestCandidate(db, {
    sourceUrl: "https://www.tatacliq.com/samsung-galaxy-tab-s9/p-tab123",
    sourcePlatform: "cuelinks",
    externalId: "SAMSUNG-TAB-S9",
    rawTitle: "Samsung Galaxy Tab S9 128GB Wi-Fi Grey",
    brand: "Samsung",
    categorySlug: "electronics",
    observedPriceMinor: 4899900, // ₹48,999
    observedMrpMinor: 7299900,  // ₹72,999
    sellerName: "Tata CLiQ Verified",
    inStock: true,
  });

  console.log("Outcome for normal deal:", verifiedCandidate.outcome);
  if (verifiedCandidate.outcome !== "PUBLISHED" || !verifiedCandidate.deal) {
    throw new Error(`Expected candidate to be auto-published, got: ${verifiedCandidate.outcome}`);
  }
  console.log("Deal auto-published successfully with slug:", verifiedCandidate.deal.slug);

  // 2. Ingest an extreme price anomaly (90% discount pricing glitch candidate)
  console.log("2. Ingesting an extreme price anomaly (probable price glitch)...");
  const anomalyCandidate = await scraperService.ingestCandidate(db, {
    sourceUrl: "https://www.amazon.in/dp/B0GLITCH99",
    sourcePlatform: "amazon",
    externalId: "B0GLITCH99",
    rawTitle: "LG 55-inch OLED 4K Smart TV",
    brand: "LG",
    categorySlug: "appliances",
    observedPriceMinor: 999900,  // ₹9,999 (92% discount on 1.25L TV)
    observedMrpMinor: 12500000, // ₹1,25,000
    sellerName: "Third-party seller",
    inStock: true,
  });

  console.log("Outcome for anomaly deal:", anomalyCandidate.outcome);
  if (anomalyCandidate.outcome !== "UNCERTAIN") {
    throw new Error(`Expected anomaly to be UNCERTAIN, got: ${anomalyCandidate.outcome}`);
  }
  console.log("Anomaly correctly routed to admin review queue. Reason:", anomalyCandidate.candidate.rejectionReason);

  // 3. Admin reviews and approves the uncertain candidate
  console.log("3. Testing admin review approval...");
  const approved = await scraperService.reviewCandidate(
    db,
    anomalyCandidate.candidate.id,
    { action: "APPROVE", reason: "Verified as clearance flash deal by admin" },
    superAdmin.id
  );

  console.log("Review outcome:", approved.status);
  if (approved.status !== "APPROVED_AND_PUBLISHED" || !approved.deal) {
    throw new Error(`Expected candidate to be approved and published, got: ${approved.status}`);
  }
  console.log("Admin approved and published deal slug:", approved.deal.slug);

  // 4. Verify Price History and Reference Statistics
  console.log("4. Verifying price observation history...");
  const stats = await getPriceReferenceStats(db, { merchantSlug: "cuelinks" });
  console.log("Price observations count for cuelinks:", stats.observationCount);
  if (stats.observationCount < 1) {
    throw new Error("Expected at least 1 price observation.");
  }

  // 5. Scraper Metrics
  console.log("5. Testing scraper summary metrics...");
  const metrics = await scraperService.getScraperMetrics(db);
  console.log("Metrics:", {
    totalCandidates: metrics.totalCandidates,
    publishedDeals: metrics.publishedDeals,
    pendingReview: metrics.pendingReview,
    totalObservations: metrics.totalObservations,
    connectors: metrics.connectors.length,
  });

  console.log("--- Deal Scraper & Intelligence Integration Tests Passed Successfully! ---");
  await disconnectDatabase();
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
