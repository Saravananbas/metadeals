import test from "node:test";
import assert from "node:assert/strict";
import { buildShareMessage, publicDealUrl } from "../src/features/deals/share-card/message";
import { imageScore, pickBestImage, type ImageProbe } from "../src/features/deals/share-card/select-image";
import type { ShareDealData } from "../src/features/deals/share-card/types";
import type { BankOfferView } from "../src/features/deals/bank-offers";

const offer = (o: Partial<BankOfferView>): BankOfferView => ({ id: "1", bankId: "b", bankName: "ICICI Bank", bankLogoUrl: null, cardType: "DEBIT", discountType: "PERCENT", flatMinor: null, percent: 10, capMinor: 150_000, minOrderMinor: null, code: null, terms: null, validUntil: null, ...o });
const deal = (d: Partial<ShareDealData> = {}): ShareDealData => ({ slug: "gleva", title: "Gleva Women Flats", priceMinor: 25_100, mrpMinor: 149_900, storeName: "Flipkart", couponCode: null, bankOffers: [], images: ["/a.webp"], expired: false, ...d });
const URL_ = "https://metadeals4u.in/d/b4kmcrrb";

test("share message: plain text in the requested order, nothing added", () => {
  const full = buildShareMessage(deal({ couponCode: "LOCALTEST10", bankOffers: [offer({ bankName: "HDFC Bank", cardType: "CREDIT", bankId: "h", discountType: "FLAT", flatMinor: 100_000, percent: null, capMinor: null, minOrderMinor: 500_000 }), offer({})] }), URL_);
  assert.equal(full, [
    "Gleva Women Flats",
    "Selling Price: ₹251",
    "MRP: ₹1,499",
    "Coupon: LOCALTEST10",
    "Bank Offers:",
    "\u2022 HDFC Bank: ₹1,000 off on credit cards, minimum order ₹5,000.",
    "\u2022 ICICI Bank: 10% off up to ₹1,500 on debit cards.",
    "Open Deal:",
    URL_,
  ].join("\n"));
  assert.ok(!/MetaDeals4U|\u{1F525}|Grab|Discover/u.test(full), "no branding, slogan or emoji");
});

test("share message: parts that do not exist are left out", () => {
  const bare = buildShareMessage(deal(), URL_);
  assert.equal(bare, ["Gleva Women Flats", "Selling Price: ₹251", "MRP: ₹1,499", "Open Deal:", URL_].join("\n"));
  assert.ok(!/Coupon|Bank Offers/.test(bare));
  assert.ok(!/MRP/.test(buildShareMessage(deal({ mrpMinor: 25_100 }), URL_)), "no MRP line when it equals the price");
  assert.ok(!buildShareMessage(deal(), URL_, { includeUrl: false }).includes("http"), "Telegram takes the link separately");
  assert.match(buildShareMessage(deal({ bankOffers: [offer({ bankId: null, bankName: "UPI payments", cardType: "UPI" })] }), URL_), /UPI payments: 10% off up to ₹1,500\./);
});

test("the shared link is the production address, never localhost", () => {
  const id = "cmwsz5n3q006jgsfab4kmcrrb";
  assert.equal(publicDealUrl("http://localhost:4123", { id, slug: "x" }), "https://metadeals4u.in/d/b4kmcrrb");
  assert.equal(publicDealUrl("http://127.0.0.1:3000", { id, slug: "x" }), "https://metadeals4u.in/d/b4kmcrrb");
  assert.equal(publicDealUrl("https://staging.metadeals4u.in", { id, slug: "x" }), "https://staging.metadeals4u.in/d/b4kmcrrb");
  assert.equal(publicDealUrl("http://localhost:4123", { id: "demo", slug: "a b" }), "https://metadeals4u.in/deal/a%20b", "a deal without a real id falls back to the full page address");
});

const probe = (url: string, width: number, height: number, primary = false): ImageProbe => ({ url, width, height, primary });
test("image choice: primary first, then the best of the rest; never a thumbnail, banner or placeholder", () => {
  assert.equal(pickBestImage([probe("/p", 800, 800, true), probe("/q", 3000, 3000)])?.url, "/p");
  assert.equal(pickBestImage([probe("/p", 120, 120, true), probe("/q", 900, 1200)])?.url, "/q", "a thumbnail primary is skipped");
  assert.equal(pickBestImage([probe("/banner", 2000, 400), probe("/q", 600, 700)])?.url, "/q", "a banner is skipped");
  assert.equal(pickBestImage([probe("/x", 800, 800), probe("/y", 1600, 1600)])?.url, "/y", "higher resolution wins among the rest");
  assert.equal(pickBestImage([probe("/images/placeholder.svg", 800, 800, true)]), null);
  assert.equal(pickBestImage([]), null);
  assert.equal(pickBestImage([probe("/p", 800, 800, true), probe("/p", 800, 800, true)])?.url, "/p", "a repeated picture counts once");
  assert.equal(imageScore(probe("/z", 0, 0)), null);
});
