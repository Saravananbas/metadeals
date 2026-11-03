import { z } from "zod";

/**
 * Calculates discount percentage cleanly between MRP and selling price.
 * Returns an integer between 0 and 100.
 */
export function calculateDiscountPercent(mrpMinor: number, priceMinor: number): number {
  if (mrpMinor <= 0 || priceMinor < 0 || priceMinor > mrpMinor) {
    return 0;
  }
  return Math.round(((mrpMinor - priceMinor) / mrpMinor) * 100);
}

export interface AnomalyEvaluation {
  isAnomaly: boolean;
  reason?: string;
  severity: "NONE" | "LOW" | "HIGH" | "CRITICAL";
}

/**
 * Evaluates whether an observed price drop constitutes a potential pricing glitch
 * or extreme anomaly requiring manual admin review.
 */
export function evaluatePriceAnomaly(
  observedPriceMinor: number,
  observedMrpMinor: number,
  historicalMedianMinor?: number | null
): AnomalyEvaluation {
  const discountPercent = calculateDiscountPercent(observedMrpMinor, observedPriceMinor);

  // Hard anomaly check 1: Extreme discount >= 85% is a high likelihood of pricing error or glitch
  if (discountPercent >= 85) {
    return {
      isAnomaly: true,
      reason: `Extreme discount of ${discountPercent}% exceeds 85% threshold (probable price error)`,
      severity: discountPercent >= 92 ? "CRITICAL" : "HIGH",
    };
  }

  // Hard anomaly check 2: Price drop >= 70% below historical 30-day median
  if (historicalMedianMinor && historicalMedianMinor > 0) {
    const dropFromMedianPercent = Math.round(
      ((historicalMedianMinor - observedPriceMinor) / historicalMedianMinor) * 100
    );
    if (dropFromMedianPercent >= 70) {
      return {
        isAnomaly: true,
        reason: `Price drop of ${dropFromMedianPercent}% compared to 30-day median (₹${Math.round(historicalMedianMinor / 100)})`,
        severity: dropFromMedianPercent >= 80 ? "CRITICAL" : "HIGH",
      };
    }
  }

  return { isAnomaly: false, severity: "NONE" };
}

export const candidateInputSchema = z.object({
  sourceUrl: z.string().url().max(2048).refine((u) => u.startsWith("https://"), {
    message: "Source URL must use secure HTTPS protocol",
  }),
  sourcePlatform: z.string().min(2).max(60),
  externalId: z.string().max(120).optional(),
  rawTitle: z.string().min(3).max(300),
  brand: z.string().max(100).optional(),
  categorySlug: z.string().min(2).max(100),
  observedPriceMinor: z.number().int().positive(),
  observedMrpMinor: z.number().int().positive(),
  currency: z.string().length(3).default("INR"),
  imageUrl: z.string().url().max(2048).optional(),
  sellerName: z.string().max(150).optional(),
  inStock: z.boolean().default(true),
  rawData: z.string().optional(),
}).refine((data) => data.observedPriceMinor <= data.observedMrpMinor, {
  message: "Selling price cannot exceed MRP",
  path: ["observedPriceMinor"],
});

export type CandidateInput = z.infer<typeof candidateInputSchema>;

export const candidateReviewActionSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  reason: z.string().max(500).optional(),
});

export type CandidateReviewAction = z.infer<typeof candidateReviewActionSchema>;
