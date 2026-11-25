import test from "node:test";
import assert from "node:assert/strict";
import { bestOffer, indiaToday, offerHeadline, offerSavingMinor, scheduleActive, scheduleLabel, type BankOfferView } from "../src/features/deals/bank-offers";
import { bankOfferSchema } from "../src/features/deals/validation";
import { draftsToInput, newBankOfferDraft } from "../src/features/deals/components/BankOffersEditor";

const offer = (o: Partial<BankOfferView>): BankOfferView => ({ id: "1", bankId: "b", bankName: "HDFC Bank", bankLogoUrl: null, cardType: "CREDIT", discountType: "FLAT", flatMinor: 100_000, percent: null, capMinor: null, minOrderMinor: null, code: null, terms: null, validUntil: null, ...o });

test("flat and percentage offers, cap and minimum order", () => {
  assert.equal(offerSavingMinor(offer({}), 5_000_000), 100_000);
  assert.equal(offerSavingMinor(offer({ discountType: "PERCENT", flatMinor: null, percent: 10, capMinor: 150_000 }), 5_000_000), 150_000);
  assert.equal(offerSavingMinor(offer({ discountType: "PERCENT", flatMinor: null, percent: 10 }), 100_000), 10_000);
  assert.equal(offerSavingMinor(offer({ minOrderMinor: 6_000_000 }), 5_000_000), 0);
  assert.equal(offerSavingMinor(offer({ flatMinor: 9_999_999 }), 5_000_000), 5_000_000, "never more than the price");
});

test("the best offer and its effective price", () => {
  const best = bestOffer([offer({ id: "a", flatMinor: 50_000 }), offer({ id: "b", flatMinor: 120_000 }), offer({ id: "c", minOrderMinor: 9_000_000, flatMinor: 900_000 })], 5_000_000);
  assert.equal(best?.offer.id, "b");
  assert.equal(best?.effectiveMinor, 4_880_000);
  assert.equal(bestOffer([], 5_000_000), null);
  assert.match(offerHeadline(offer({ discountType: "PERCENT", flatMinor: null, percent: 10, capMinor: 150_000 })), /10% off up to/);
});

test("the form rows become a valid server offer, and incomplete rows are refused", () => {
  const ok = draftsToInput([{ ...newBankOfferDraft(), bankId: "b1", amount: "1000", validUntil: "2026-12-31", code: "HDFC10" }]);
  assert.equal(ok[0].flatMinor, 100_000);
  assert.equal(ok[0].validUntil, "2026-12-31T23:59:59+05:30");
  assert.ok(bankOfferSchema.safeParse(ok[0]).success);
  assert.throws(() => draftsToInput([newBankOfferDraft()]), /choose a bank/);
  assert.throws(() => draftsToInput([{ ...newBankOfferDraft(), bankId: "b1", discountType: "PERCENT", percent: "150" }]), /between 1 and 100/);
  assert.equal(bankOfferSchema.safeParse({ ...ok[0], flatMinor: null }).success, false);
});

test("store-wide offers: date range and weekdays (Indian time)", () => {
  const wed = indiaToday(new Date("2026-11-25T10:00:00+05:30"));
  assert.equal(wed.weekday, 3);
  assert.equal(wed.ymd, "2026-11-25");
  const rule = { startsOn: "2026-11-01", endsOn: "2026-12-31", weekdays: "3" };
  assert.equal(scheduleActive(rule, wed), true);
  assert.equal(scheduleActive(rule, indiaToday(new Date("2026-11-26T10:00:00+05:30"))), false, "Thursday");
  assert.equal(scheduleActive({ ...rule, weekdays: "" }, indiaToday(new Date("2026-11-26T10:00:00+05:30"))), true, "every day");
  assert.equal(scheduleActive(rule, indiaToday(new Date("2027-01-06T10:00:00+05:30"))), false, "after the end date");
  assert.equal(scheduleActive({ ...rule, endsOn: null }, indiaToday(new Date("2027-01-06T10:00:00+05:30"))), true, "no end date");
  assert.equal(scheduleActive(rule, indiaToday(new Date("2026-10-28T10:00:00+05:30"))), false, "before the start");
  assert.equal(indiaToday(new Date("2026-11-25T22:30:00Z")).ymd, "2026-11-26", "late evening UTC is already the next day in India");
  assert.equal(scheduleLabel("3"), "Every Wednesday");
  assert.equal(scheduleLabel("1,3"), "Every Monday and Wednesday");
  assert.equal(scheduleLabel(""), null);
});

test("UPI and wallet offers need no bank; card offers do", () => {
  const upi = draftsToInput([{ ...newBankOfferDraft(), cardType: "UPI", amount: "100" }]);
  assert.equal(upi[0].bankId, null);
  assert.ok(bankOfferSchema.safeParse(upi[0]).success);
  assert.equal(bankOfferSchema.safeParse({ ...upi[0], cardType: "CREDIT" }).success, false, "a card offer still needs a bank");
  assert.equal(draftsToInput([{ ...newBankOfferDraft(), cardType: "WALLET", bankId: "stale", amount: "50" }])[0].bankId, null, "a bank left selected is dropped");
});
