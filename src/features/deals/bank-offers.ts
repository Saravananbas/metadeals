import { formatPaise } from "./currency";

export type BankOfferView = {
  id: string; bankId: string | null; bankName: string; bankLogoUrl: string | null;
  cardType: string; discountType: string; flatMinor: number | null; percent: number | null; capMinor: number | null; minOrderMinor: number | null;
  code: string | null; terms: string | null; validUntil: string | null;
  /** Set for a store-wide offer that repeats, e.g. "Every Wednesday". */
  schedule?: string | null;
};

export const CARD_TYPE_LABEL: Record<string, string> = { CREDIT: "credit cards", DEBIT: "debit cards", EMI: "EMI", UPI: "UPI", WALLET: "wallet", ANY: "cards" };
/** Name shown for an offer that has no bank (UPI and wallet payments). */
export const PAYMENT_NAME: Record<string, string> = { UPI: "UPI payments", WALLET: "Wallet payments" };
/** "HDFC Bank credit cards", or "UPI payments" when the offer is tied to a payment method rather than a bank. */
export const offerWith = (o: Pick<BankOfferView, "bankId" | "bankName" | "cardType">) => (o.bankId ? `${o.bankName} ${CARD_TYPE_LABEL[o.cardType] ?? "cards"}` : o.bankName);

/** What the offer saves on a price (paise); a percentage offer is cut at its cap, and an order below the minimum saves nothing. */
export function offerSavingMinor(offer: Pick<BankOfferView, "discountType" | "flatMinor" | "percent" | "capMinor" | "minOrderMinor">, priceMinor: number): number {
  if (offer.minOrderMinor && priceMinor < offer.minOrderMinor) return 0;
  const raw = offer.discountType === "FLAT" ? offer.flatMinor ?? 0 : Math.floor(((offer.percent ?? 0) * priceMinor) / 100);
  const capped = offer.discountType === "PERCENT" && offer.capMinor ? Math.min(raw, offer.capMinor) : raw;
  return Math.max(0, Math.min(capped, priceMinor));
}

export const offerHeadline = (o: BankOfferView) =>
  o.discountType === "FLAT" ? `${formatPaise(o.flatMinor ?? 0)} off` : `${o.percent}% off${o.capMinor ? ` up to ${formatPaise(o.capMinor)}` : ""}`;

export const offerLine = (o: BankOfferView) => `${offerHeadline(o)} with ${offerWith(o)}`;

/** The offer that saves the most on this price, with the effective price after it. */
export function bestOffer(offers: BankOfferView[] | undefined, priceMinor: number) {
  let best: { offer: BankOfferView; savingMinor: number; effectiveMinor: number } | null = null;
  for (const offer of offers ?? []) {
    const savingMinor = offerSavingMinor(offer, priceMinor);
    if (savingMinor > 0 && (!best || savingMinor > best.savingMinor)) best = { offer, savingMinor, effectiveMinor: priceMinor - savingMinor };
  }
  return best;
}

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Today's date (YYYY-MM-DD) and weekday (0 = Sunday) in Indian time, the clock a store-wide offer runs on. */
export function indiaToday(now = new Date()) {
  const ymd = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const [y, m, d] = ymd.split("-").map(Number);
  return { ymd, weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

export type OfferSchedule = { startsOn: string; endsOn: string | null; weekdays: string };

/** Is a store-wide offer in force on this day? From the first day through the last day, and on the chosen weekdays when it repeats. */
export function scheduleActive(rule: OfferSchedule, today = indiaToday()): boolean {
  if (today.ymd < rule.startsOn || (rule.endsOn && today.ymd > rule.endsOn)) return false;
  const days = rule.weekdays ? rule.weekdays.split(",").map(Number) : [];
  return days.length === 0 || days.includes(today.weekday);
}

export function scheduleLabel(weekdays: string): string | null {
  const days = weekdays ? weekdays.split(",").map(Number).sort() : [];
  if (!days.length || days.length === 7) return null;
  return `Every ${days.map((d) => WEEKDAY_NAMES[d]).join(" and ")}`;
}

const SHARE_SUFFIX: Record<string, string> = { CREDIT: " on credit cards", DEBIT: " on debit cards", EMI: " on EMI" };
/** One line for the share message and card: "HDFC Bank: ₹1,000 off on credit cards, min. order ₹5,000 (Every Wednesday)". */
export const offerShareLine = (o: BankOfferView) =>
  `${o.bankName}: ${offerHeadline(o)}${o.bankId ? SHARE_SUFFIX[o.cardType] ?? "" : ""}${o.minOrderMinor ? `, min. order ${formatPaise(o.minOrderMinor)}` : ""}${o.schedule ? ` (${o.schedule})` : ""}`;
