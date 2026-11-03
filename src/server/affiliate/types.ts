export * from "@/features/affiliate/validation";

export type AffiliateStatus = "PENDING" | "APPROVED" | "REJECTED" | "PAID";

export interface ClickRecordInput {
  dealId: string;
  optionId?: string | null;
  merchantId: string;
  channel: string;
  actorHash: string;
}

export interface RedirectResolution {
  destinationUrl: string;
  dealId: string;
  merchantId: string;
  optionId: string | null;
  loggedClick: boolean;
}
