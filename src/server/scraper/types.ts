import "server-only";
import type { CandidateInput, AnomalyEvaluation } from "@/features/scraper/validation";

export type { CandidateInput, AnomalyEvaluation };

export interface PriceReferenceStats {
  observationCount: number;
  median7DayMinor: number | null;
  median30DayMinor: number | null;
  median90DayMinor: number | null;
  lowestObservedMinor: number | null;
  highestObservedMinor: number | null;
  latestObservedAt: Date | null;
}

export type CandidateVerificationStatus = "VERIFIED" | "UNCERTAIN" | "REJECTED";

export interface VerificationResult {
  status: CandidateVerificationStatus;
  confidenceScore: number; // 0 to 100
  rejectionReason?: string;
  anomaly?: AnomalyEvaluation;
  passedGates: string[];
  failedGates: string[];
}

export interface RetailerProductListing {
  sourceUrl: string;
  sourcePlatform: string;
  externalId?: string;
  rawTitle: string;
  brand?: string;
  categorySlug: string;
  observedPriceMinor: number;
  observedMrpMinor: number;
  currency: string;
  imageUrl?: string;
  sellerName?: string;
  inStock: boolean;
  rawData?: string;
}

export interface ConnectorHealthResult {
  code: string;
  isHealthy: boolean;
  message?: string;
  lastCheckedAt: Date;
}

export interface RetailerConnector {
  code: string;
  name: string;
  checkHealth(): Promise<ConnectorHealthResult>;
  discoverListings(): Promise<RetailerProductListing[]>;
}
