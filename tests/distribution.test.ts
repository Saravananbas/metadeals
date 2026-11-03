import test from "node:test";
import assert from "node:assert/strict";
import {
  formatTelegramMessage,
  formatWhatsAppMessage,
  createWhatsAppShareUrl,
  calculateSavingPercent,
  destinationInputSchema,
  publishDealInputSchema,
} from "../src/features/distribution/formatting";

const sampleDeal = {
  id: "deal-123",
  slug: "sony-wh-1000xm5-headphones",
  title: "Sony WH-1000XM5 Wireless Headphones",
  brand: "Sony",
  priceMinor: 2499000, // 24,990 INR
  mrpMinor: 3499000,   // 34,990 INR
  merchantName: "Amazon India",
  siteBaseUrl: "https://metadeals4u.in",
};

test("calculateSavingPercent computes exact rounded discount percentages", () => {
  assert.equal(calculateSavingPercent(100000, 200000), 50);
  assert.equal(calculateSavingPercent(2499000, 3499000), 29); // (34990 - 24990) / 34990 = ~28.57% -> 29%
  assert.equal(calculateSavingPercent(100000, 100000), 0);
  assert.equal(calculateSavingPercent(150000, 100000), 0);
  assert.equal(calculateSavingPercent(5000, 0), 0);
});

test("formatTelegramMessage generates compliant HTML with tracked link and emojis", () => {
  const message = formatTelegramMessage(sampleDeal);

  assert.match(message, /🔥 <b>Sony WH-1000XM5 Wireless Headphones<\/b>/);
  assert.match(message, /🏷️ Brand: <b>Sony<\/b>/);
  assert.match(message, /<b>29% OFF<\/b>/);
  assert.match(message, /🏪 Store: <b>Amazon India<\/b>/);
  assert.match(message, /href="https:\/\/metadeals4u\.in\/go\/sony-wh-1000xm5-headphones\?c=telegram"/);
});

test("formatWhatsAppMessage generates bold and strike-through formatting", () => {
  const message = formatWhatsAppMessage(sampleDeal);

  assert.match(message, /🔥 \*Sony WH-1000XM5 Wireless Headphones\*/);
  assert.match(message, /\*29% OFF\*/);
  assert.match(message, /🏪 Store: \*Amazon India\*/);
  assert.match(message, /👉 Buy Now: https:\/\/metadeals4u\.in\/go\/sony-wh-1000xm5-headphones\?c=whatsapp/);
});

test("createWhatsAppShareUrl produces a valid wa.me share link", () => {
  const shareUrl = createWhatsAppShareUrl(sampleDeal);

  assert.match(shareUrl, /^https:\/\/wa\.me\/\?text=/);
  assert.match(shareUrl, /Sony/);
  assert.match(shareUrl, /metadeals4u\.in/);
});

test("destinationInputSchema validates platform and destination id", () => {
  assert.equal(
    destinationInputSchema.safeParse({
      platform: "TELEGRAM",
      name: "Deals Telegram Channel",
      destinationId: "@metadeals_deals",
    }).success,
    true
  );

  assert.equal(
    destinationInputSchema.safeParse({
      platform: "WHATSAPP",
      name: "WhatsApp VIP Group",
      destinationId: "1203630248@g.us",
    }).success,
    true
  );

  // Invalid platform
  assert.equal(
    destinationInputSchema.safeParse({
      platform: "DISCORD",
      name: "Discord",
      destinationId: "123",
    }).success,
    false
  );
});

test("publishDealInputSchema requires at least one destination ID", () => {
  assert.equal(
    publishDealInputSchema.safeParse({
      dealId: "d1",
      destinationIds: ["dest-1", "dest-2"],
    }).success,
    true
  );

  assert.equal(
    publishDealInputSchema.safeParse({
      dealId: "d1",
      destinationIds: [],
    }).success,
    false
  );
});
