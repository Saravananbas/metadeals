import test from "node:test";
import assert from "node:assert/strict";
import { buildShareMessage, publicDealUrl, type ShareLinks } from "../src/features/deals/share-card/message";
import { imageScore, pickBestImage, type ImageProbe } from "../src/features/deals/share-card/select-image";
import { offerShareLine, type BankOfferView } from "../src/features/deals/bank-offers";
import type { ShareDealData } from "../src/features/deals/share-card/types";

const offer = (o: Partial<BankOfferView>): BankOfferView => ({ id: "1", bankId: "b", bankName: "Axis Bank", bankLogoUrl: null, cardType: "CREDIT", discountType: "PERCENT", flatMinor: null, percent: 10, capMinor: 150_000, minOrderMinor: null, code: null, terms: null, validUntil: null, ...o });
const deal = (d: Partial<ShareDealData> = {}): ShareDealData => ({ slug: "tcl", title: "TCL P8K 98 inch QLED", priceMinor: 27_698_900, mrpMinor: 69_999_900, storeName: "Flipkart", couponCode: "LOCALTEST10", bankOffers: [offer({})], images: ["/a.webp"], expired: false, ...d });
const URL_ = "https://metadeals4u.in/d/d3lxciw4";
const none: ShareLinks = { social: [] };

test("message: deal price, a Buy Now link and the follow line; coupon and offers are not repeated", () => {
  const m = buildShareMessage(deal(), URL_, { links: none });
  assert.equal(m, ["Deal Price: Rs. 2,76,989", "Buy Now:", URL_, "Follow Us for More Deals on MetaDeals4U!"].join("\n"));
  assert.ok(!/Coupon|LOCALTEST10|Bank Offers|Axis/.test(m), "they are already in the picture");
  assert.ok(!/App Store|Play Store/.test(m), "no store line when no listing is configured");
});

test("message: app and social links only when configured; Telegram takes the link separately", () => {
  const both = buildShareMessage(deal(), URL_, { links: { playStore: "https://play.google.com/store/apps/details?id=in.metadeals4u", appStore: "https://apps.apple.com/in/app/x/id1", social: [{ label: "Instagram", url: "https://instagram.com/metadeals4u" }] } });
  assert.match(both, /Instagram: https:\/\/instagram\.com\/metadeals4u/);
  assert.match(both, /Download our App in Play Store & App Store\./);
  assert.match(both, /Play Store: https:\/\/play\.google\.com/);
  assert.match(buildShareMessage(deal(), URL_, { links: { playStore: "https://play.google.com/x", social: [] } }), /Download our App on Play Store\./);
  const tg = buildShareMessage(deal(), URL_, { includeUrl: false, links: none });
  assert.ok(!tg.includes("http") && !tg.includes("Buy Now"));
});

test("the shared link is the production address, never localhost", () => {
  const id = "cmwsz5n3q006jgsfab4kmcrrb";
  assert.equal(publicDealUrl("http://localhost:4123", { id, slug: "x" }), "https://metadeals4u.in/d/b4kmcrrb");
  assert.equal(publicDealUrl("http://127.0.0.1:3000", { id, slug: "x" }), "https://metadeals4u.in/d/b4kmcrrb");
  assert.equal(publicDealUrl("https://staging.metadeals4u.in", { id, slug: "x" }), "https://staging.metadeals4u.in/d/b4kmcrrb");
});

test("bank offer lines keep their conditions", () => {
  assert.equal(offerShareLine(offer({ minOrderMinor: 350_000 })), "Axis Bank: 10% off up to ₹1,500 on credit cards, min. order ₹3,500.");
  assert.equal(offerShareLine(offer({ bankName: "UPI payments", bankId: null, cardType: "UPI", capMinor: 20_000 })), "UPI payments: 10% off up to ₹200.");
  assert.equal(offerShareLine(offer({ cardType: "EMI", capMinor: 250_000 })), "Axis Bank: 10% off up to ₹2,500 on EMI.");
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
