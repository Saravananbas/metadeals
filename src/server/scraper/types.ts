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
  isMockOrFixture?: boolean;
}

export type ConnectorHealthStatus =
  | "LIVE_CONNECTED"
  | "LIVE_DATA_RETRIEVED"
  | "MOCK_MODE"
  | "FIXTURE_MODE"
  | "BLOCKED"
  | "ERROR"
  | "NOT_CONFIGURED";

export interface ConnectorHealthResult {
  code: string;
  status: ConnectorHealthStatus;
  isHealthy: boolean;
  isLive: boolean;
  message?: string;
  lastCheckedAt: Date;
  lastLiveRetrievalAt?: Date | null;
  lastMockScanAt?: Date | null;
}

export interface RetailerConnector {
  code: string;
  name: string;
  readonly isLive: boolean;
  checkHealth(): Promise<ConnectorHealthResult>;
  discoverListings(): Promise<RetailerProductListing[]>;
}
