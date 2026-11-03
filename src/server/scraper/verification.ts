import "server-only";
import {
  calculateDiscountPercent,
  evaluatePriceAnomaly,
  type CandidateInput,
} from "@/features/scraper/validation";
import type { VerificationResult, PriceReferenceStats } from "./types";

/**
 * Validates a candidate offer against deterministic verification gates.
 *
 * Publishing Policy:
 * 1. VERIFIED: Passes all mandatory gates and within normal variance -> Auto-publish.
 * 2. UNCERTAIN: Valid price & discount, but high discount / median drop / unknown seller -> Admin review.
 * 3. REJECTED: Fails basic constraints (Price > MRP, non-HTTPS, invalid price) -> Never publish.
 */
export function verifyCandidate(
  input: CandidateInput,
  priceStats?: PriceReferenceStats | null
): VerificationResult {
  const passedGates: string[] = [];
  const failedGates: string[] = [];

  // Gate 1: URL must be secure HTTPS
  if (input.sourceUrl.startsWith("https://")) {
    passedGates.push("GATE_SECURE_HTTPS");
  } else {
    failedGates.push("GATE_SECURE_HTTPS");
    return {
      status: "REJECTED",
      confidenceScore: 0,
      rejectionReason: "Source URL must use secure HTTPS protocol.",
      passedGates,
      failedGates,
    };
  }

  // Gate 2: Positive prices
  if (input.observedMrpMinor > 0 && input.observedPriceMinor > 0) {
    passedGates.push("GATE_POSITIVE_PRICES");
  } else {
    failedGates.push("GATE_POSITIVE_PRICES");
    return {
      status: "REJECTED",
      confidenceScore: 0,
      rejectionReason: "Price and MRP must be positive integers.",
      passedGates,
      failedGates,
    };
  }

  // Gate 3: Price <= MRP
  if (input.observedPriceMinor <= input.observedMrpMinor) {
    passedGates.push("GATE_PRICE_LTE_MRP");
  } else {
    failedGates.push("GATE_PRICE_LTE_MRP");
    return {
      status: "REJECTED",
      confidenceScore: 0,
      rejectionReason: "Observed price exceeds MRP.",
      passedGates,
      failedGates,
    };
  }

  // Gate 4: In stock
  if (input.inStock) {
    passedGates.push("GATE_IN_STOCK");
  } else {
    failedGates.push("GATE_IN_STOCK");
    return {
      status: "REJECTED",
      confidenceScore: 10,
      rejectionReason: "Product is out of stock.",
      passedGates,
      failedGates,
    };
  }

  // Gate 5: Minimum discount threshold (at least 5%)
  const discountPercent = calculateDiscountPercent(
    input.observedMrpMinor,
    input.observedPriceMinor
  );
  if (discountPercent >= 5) {
    passedGates.push("GATE_MINIMUM_DISCOUNT");
  } else {
    failedGates.push("GATE_MINIMUM_DISCOUNT");
    return {
      status: "REJECTED",
      confidenceScore: 20,
      rejectionReason: `Discount of ${discountPercent}% is below the 5% deal threshold.`,
      passedGates,
      failedGates,
    };
  }

  // Gate 6: Evaluate price anomaly / glitch risk
  const anomaly = evaluatePriceAnomaly(
    input.observedPriceMinor,
    input.observedMrpMinor,
    priceStats?.median30DayMinor
  );

  let confidenceScore = 50;

  if (input.brand) confidenceScore += 15;
  if (input.imageUrl) confidenceScore += 15;
  if (input.sellerName) confidenceScore += 10;
  if (priceStats && priceStats.observationCount >= 3) confidenceScore += 10;

  if (anomaly.isAnomaly) {
    failedGates.push("GATE_PRICE_ANOMALY");
    return {
      status: "UNCERTAIN",
      confidenceScore: Math.min(confidenceScore, 60),
      rejectionReason: anomaly.reason,
      anomaly,
      passedGates,
      failedGates,
    };
  }

  passedGates.push("GATE_PRICE_ANOMALY");

  // If score is good and no anomaly, verified!
  return {
    status: "VERIFIED",
    confidenceScore: Math.min(confidenceScore, 100),
    anomaly,
    passedGates,
    failedGates,
  };
}
