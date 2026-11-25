import test from "node:test";
import assert from "node:assert/strict";
import { buildShareMessage } from "../src/features/deals/share-card/message";
import { imageScore, pickBestImage, type ImageProbe } from "../src/features/deals/share-card/select-image";
import { chooseLayout, scoreLayouts, type LayoutInput } from "../src/features/deals/share-card/layout";
import type { ShareDealData } from "../src/features/deals/share-card/types";
import type { BankOfferView } from "../src/features/deals/bank-offers";

const offer = (o: Partial<BankOfferView>): BankOfferView => ({ id: "1", bankId: "b", bankName: "ICICI Bank", bankLogoUrl: null, cardType: "ANY", discountType: "PERCENT", flatMinor: null, percent: 10, capMinor: 150_000, minOrderMinor: null, code: null, terms: null, validUntil: null, ...o });
const deal = (d: Partial<ShareDealData> = {}): ShareDealData => ({ slug: "gleva", title: "Gleva Women Flats", priceMinor: 25_100, mrpMinor: 149_900, storeName: "Flipkart", couponCode: null, bankOffers: [], images: ["/a.webp"], expired: false, ...d });

test("share message uses the deal's own data and leaves out what is missing", () => {
  const bare = buildShareMessage(deal(), "https://x.in/d/abc");
  assert.match(bare, /83% OFF \u2013 Gleva Women Flats/);
  assert.match(bare, /MRP: ₹1,499/);
  assert.match(bare, /Deal Price: ₹251/);
  assert.match(bare, /You Save: ₹1,248/);
  assert.ok(bare.includes("https://x.in/d/abc"));
  assert.ok(!/Coupon|Bank Offers/.test(bare), "no coupon or bank section when there is none");
  const full = buildShareMessage(deal({ couponCode: "SAVE10", bankOffers: [offer({}), offer({ bankName: "HDFC Bank", cardType: "CREDIT", bankId: "h", discountType: "FLAT", flatMinor: 100_000, percent: null, capMinor: null })] }), "https://x.in/d/abc");
  assert.match(full, /Coupon: SAVE10/);
  assert.match(full, /\u2022 ICICI Bank: 10% off up to ₹1,500/);
  assert.match(full, /\u2022 HDFC Bank: ₹1,000 off on credit cards/);
  assert.ok(!buildShareMessage(deal(), "https://x.in/d/abc", { includeUrl: false }).includes("https://"), "Telegram takes the link separately");
  const noDiscount = buildShareMessage(deal({ mrpMinor: 25_100 }), "u");
  assert.ok(!/MRP|You Save|% OFF/.test(noDiscount), "no discount lines when the price equals the MRP");
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

const long = "Samsung Galaxy S24 Ultra 5G (Titanium Gray, 12GB RAM, 256GB Storage) with Galaxy AI, 200MP Camera and S Pen";
const lines = (n: number) => Array.from({ length: n }, (_, i) => `Bank ${i}: 10% off up to ₹1,500 on credit cards`);
const layout = (o: Partial<LayoutInput>) => chooseLayout({ imageWidth: 1000, imageHeight: 1000, title: "Boat Earbuds", hasDiscount: true, hasCoupon: false, offerLines: [], ...o });

test("layout: picture shape and amount of text both decide", () => {
  assert.equal(layout({ imageWidth: 800, imageHeight: 1200, title: "Gleva Women Flats", hasCoupon: true, offerLines: lines(1) }).format, "portrait");
  assert.equal(layout({ imageWidth: 1600, imageHeight: 900, title: long, offerLines: lines(5) }).format, "landscape");
  assert.equal(layout({}).format, "square");
  assert.equal(layout({ imageWidth: 1600, imageHeight: 900, title: "Wall Clock", hasCoupon: true }).format, "landscape");
  // Portrait picture with a lot of text: the choice is made on how much room the text gets, and it is reported honestly.
  const heavy = scoreLayouts({ imageWidth: 800, imageHeight: 1200, title: long, hasDiscount: true, hasCoupon: true, offerLines: lines(5) });
  assert.equal(heavy.every((c) => c.score > 0), true);
  // Square picture with a long title and offers: whichever card is chosen must be the one that overflows least or is clearly the better balance.
  const squareHeavy = scoreLayouts({ imageWidth: 1000, imageHeight: 1000, title: long, hasDiscount: true, hasCoupon: true, offerLines: lines(3) });
  const picked = layout({ title: long, hasCoupon: true, offerLines: lines(3) });
  const overflow = (c: { infoNeeded: number; infoAvailable: number }) => c.infoNeeded - c.infoAvailable;
  assert.ok(overflow(picked) <= Math.max(...squareHeavy.map(overflow)));
});

test("layout: more text never makes the verdict fit better", () => {
  const few = scoreLayouts({ imageWidth: 800, imageHeight: 1200, title: "Flats", hasDiscount: true, hasCoupon: false, offerLines: [] });
  const many = scoreLayouts({ imageWidth: 800, imageHeight: 1200, title: "Flats", hasDiscount: true, hasCoupon: false, offerLines: lines(8) });
  for (const f of few) assert.ok(many.find((m) => m.format === f.format)!.infoNeeded > f.infoNeeded);
});

test("phones only ever get the portrait card, whatever the picture and text", () => {
  const cases: LayoutInput[] = [
    { imageWidth: 1600, imageHeight: 900, title: long, hasDiscount: true, hasCoupon: true, offerLines: lines(5) },
    { imageWidth: 1000, imageHeight: 1000, title: "Boat Earbuds", hasDiscount: true, hasCoupon: false, offerLines: [] },
    { imageWidth: 1600, imageHeight: 900, title: "Wall Clock", hasDiscount: true, hasCoupon: true, offerLines: [] },
  ];
  for (const c of cases) assert.equal(chooseLayout(c, ["portrait"]).format, "portrait");
  assert.equal(chooseLayout(cases[2]).format, "landscape", "wider screens still choose freely");
});
