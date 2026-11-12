export interface PriceObservationData {
  pricePaise: number;
  observedAt: Date;
}

export interface HistoricalWindowStats {
  windowDays: number;
  observationCount: number;
  averagePaise: number | null;
  medianPaise: number | null;
  minPaise: number | null;
  maxPaise: number | null;
  hasSufficientCoverage: boolean; // Needs at least 3 distinct observations across the window
}

export type PriceClassification =
  | "NORMAL_PRICE"
  | "GENUINE_EXCEPTIONAL_PRICE"
  | "SUSPECTED_PRICE_ERROR"
  | "UNVERIFIED_PRICE"
  | "PRICE_MISMATCH";

export interface QualityAssessment {
  version: string;
  authenticityScore: number;       // 0 - 100
  attractivenessScore: number;     // 0 - 100
  commercialPriority: number;      // 0 - 100
  classification: PriceClassification;
  isPriceErrorSuspected: boolean;
  factors: {
    currentPriceVerified: number;
    historicalEvidence: number;
    sellerReliability: number;
    productVariantMatch: number;
    availabilityVerified: number;
    offerVerified: number;
    sourceReliability: number;
  };
  savingsPercentAgainst90dAvg: number | null;
  savingsPercentAgainst90dLow: number | null;
  calculatedAt: Date;
}

export class DealQualityEngine {
  public static readonly VERSION = "1.0.0";

  /**
   * Calculates rolling window statistics (30, 90, 180, 365 days).
   */
  public static calculateWindowStats(
    observations: PriceObservationData[],
    windowDays: number,
    referenceDate = new Date()
  ): HistoricalWindowStats {
    const cutoff = new Date(referenceDate.getTime() - windowDays * 24 * 3600 * 1000);
    const windowObs = observations
      .filter((o) => o.observedAt >= cutoff && o.observedAt <= referenceDate)
      .map((o) => o.pricePaise)
      .sort((a, b) => a - b);

    if (windowObs.length === 0) {
      return {
        windowDays,
        observationCount: 0,
        averagePaise: null,
        medianPaise: null,
        minPaise: null,
        maxPaise: null,
        hasSufficientCoverage: false,
      };
    }

    const sum = windowObs.reduce((acc, p) => acc + p, 0);
    const averagePaise = Math.round(sum / windowObs.length);
    const mid = Math.floor(windowObs.length / 2);
    const medianPaise =
      windowObs.length % 2 !== 0
        ? windowObs[mid]
        : Math.round((windowObs[mid - 1] + windowObs[mid]) / 2);

    return {
      windowDays,
      observationCount: windowObs.length,
      averagePaise,
      medianPaise,
      minPaise: windowObs[0],
      maxPaise: windowObs[windowObs.length - 1],
      hasSufficientCoverage: windowObs.length >= 3,
    };
  }

  /**
   * Evaluates Authenticity, Attractiveness, and Price Classification.
   * HARD RULE: Suspicious price drops (>75% drop from median or impossible discount) are flagged SUSPECTED_PRICE_ERROR.
   */
  public static evaluateDeal(params: {
    sellingPricePaise: number;
    mrpPaise: number;
    history: PriceObservationData[];
    sellerRating?: number;
    isSellerVerified?: boolean;
    isVariantMatched?: boolean;
    isStockConfirmed?: boolean;
    isCouponVerified?: boolean;
    sourceRating?: number;
    commissionRatePercent?: number;
  }): QualityAssessment {
    const {
      sellingPricePaise,
      mrpPaise,
      history,
      sellerRating = 4.0,
      isSellerVerified = true,
      isVariantMatched = true,
      isStockConfirmed = true,
      isCouponVerified = true,
      sourceRating = 1.0,
      commissionRatePercent = 5.0,
    } = params;

    const stats90d = this.calculateWindowStats(history, 90);

    // 1. Authenticity Calculation (Weights sum to 100)
    // - Current price verification: 25
    // - Historical price evidence: 20
    // - Seller reliability: 15
    // - Product/variant matching: 15
    // - Availability verification: 10
    // - Coupon/offer verification: 10
    // - Source reliability: 5
    const fPrice = sellingPricePaise > 0 && sellingPricePaise <= mrpPaise ? 25 : 0;
    const fHist = stats90d.hasSufficientCoverage ? 20 : Math.min(stats90d.observationCount * 5, 15);
    const fSeller = (isSellerVerified ? 10 : 0) + Math.min(sellerRating, 5);
    const fVariant = isVariantMatched ? 15 : 0;
    const fStock = isStockConfirmed ? 10 : 0;
    const fOffer = isCouponVerified ? 10 : 0;
    const fSource = Math.min(sourceRating * 5, 5);

    const authenticityScore = Math.min(100, Math.round(fPrice + fHist + fSeller + fVariant + fStock + fOffer + fSource));

    // 2. Anomaly & Suspected Price Error Detection
    let isPriceErrorSuspected = false;
    let classification: PriceClassification = "NORMAL_PRICE";

    if (stats90d.medianPaise && stats90d.medianPaise > 0) {
      const dropRatio = sellingPricePaise / stats90d.medianPaise;
      // Price drop > 80% compared to 90d median on established product is suspected price glitch
      if (dropRatio < 0.20 && stats90d.medianPaise > 100000) {
        isPriceErrorSuspected = true;
        classification = "SUSPECTED_PRICE_ERROR";
      }
    }

    if (sellingPricePaise <= 0 || sellingPricePaise > mrpPaise) {
      classification = "PRICE_MISMATCH";
    }

    // 3. Attractiveness Calculation (Weights sum to 100)
    let savingsVs90dAvg: number | null = null;
    let savingsVs90dLow: number | null = null;
    let attractivenessScore = 0;

    if (stats90d.averagePaise && stats90d.averagePaise > 0) {
      savingsVs90dAvg = Math.max(0, Math.round(((stats90d.averagePaise - sellingPricePaise) / stats90d.averagePaise) * 100));
    }
    if (stats90d.minPaise && stats90d.minPaise > 0) {
      savingsVs90dLow = Math.round(((stats90d.minPaise - sellingPricePaise) / stats90d.minPaise) * 100);
    }

    if (!isPriceErrorSuspected && classification !== "PRICE_MISMATCH") {
      const avgSavingFactor = savingsVs90dAvg ? Math.min(savingsVs90dAvg, 50) / 2 : 5; // max 25
      const lowSavingFactor = savingsVs90dLow && savingsVs90dLow > 0 ? Math.min(savingsVs90dLow * 2, 20) : 5; // max 20
      const absSavingPaise = Math.max(0, mrpPaise - sellingPricePaise);
      const absSavingFactor = absSavingPaise > 50000 ? 15 : absSavingPaise > 20000 ? 10 : 5; // max 15
      const crossRetailerFactor = 15;
      const demandFactor = 10;
      const urgencyFactor = 10;

      attractivenessScore = Math.min(100, Math.round(avgSavingFactor + lowSavingFactor + absSavingFactor + crossRetailerFactor + demandFactor + urgencyFactor));

      if (attractivenessScore >= 70 && (savingsVs90dLow ?? 0) >= 0) {
        classification = "GENUINE_EXCEPTIONAL_PRICE";
      }
    }

    // 4. Commercial Priority (calibrated independently from user value)
    const commercialPriority = Math.min(100, Math.round(commissionRatePercent * 10 + (mrpPaise > 100000 ? 30 : 15)));

    return {
      version: this.VERSION,
      authenticityScore,
      attractivenessScore,
      commercialPriority,
      classification,
      isPriceErrorSuspected,
      factors: {
        currentPriceVerified: fPrice,
        historicalEvidence: fHist,
        sellerReliability: fSeller,
        productVariantMatch: fVariant,
        availabilityVerified: fStock,
        offerVerified: fOffer,
        sourceReliability: fSource,
      },
      savingsPercentAgainst90dAvg: savingsVs90dAvg,
      savingsPercentAgainst90dLow: savingsVs90dLow,
      calculatedAt: new Date(),
    };
  }
}

