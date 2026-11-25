import type { BankOfferView } from "../bank-offers";

/** Everything the share card and share message are built from. Money is in paise, images are same-origin addresses with the primary one first. */
export type ShareDealData = {
  slug: string;
  title: string;
  priceMinor: number;
  mrpMinor: number;
  storeName: string | null;
  couponCode: string | null;
  bankOffers: BankOfferView[];
  images: string[];
  expired: boolean;
};
