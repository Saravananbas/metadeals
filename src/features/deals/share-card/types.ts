import type { BankOfferView } from "../bank-offers";

/** Everything the share card and share message are built from. Money is in paise, images are same-origin addresses with the primary one first. */
export type ShareDealData = {
  slug: string;
  title: string;
  priceMinor: number;
  mrpMinor: number;
  /** Travel and sale-page deals: shown instead of the price (they have no fixed price or MRP). */
  headline?: string | null;
  storeName: string | null;
  couponCode: string | null;
  bankOffers: BankOfferView[];
  images: string[];
  expired: boolean;
  /** Optional facts shown beside the photo when the title leaves room; nothing is shown for a missing one. */
  brand?: string | null;
  categoryName?: string | null;
  /** Plain-text description: a short "About" is shown only when the title leaves room beside the photo. */
  description?: string | null;
};
