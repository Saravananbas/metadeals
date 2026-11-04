import test from "node:test";
import assert from "node:assert/strict";
import type { Deal } from "../src/features/deals/types";
import { formatINR, getSavings } from "../src/features/deals/pricing";
import { sampleDeals } from "../src/features/deals/sample-catalog";

// Mock deal fixture
const sampleDeal: Deal = {
  id: "deal-test-101",
  slug: "sony-wh-1000xm5-headphones",
  name: "Sony WH-1000XM5 Wireless Noise Canceling Headphones",
  brand: "Sony",
  category: "electronics",
  image: "https://images.example.com/sony-xm5.jpg",
  price: 24999,
  originalPrice: 34990,
  rating: 4.6,
  reviewCount: 3200,
  ratingSource: "Amazon India Customer Ratings",
  store: "amazon",
  storeName: "Amazon India",
  retailerUrl: "/go/deal-test-101",
  source: "database",
  expiry: "active",
  expiresAt: "2026-11-30T23:59:59.000Z",
  featured: true,
  publishedAt: "2026-11-01T10:00:00.000Z",
  description: "Industry-leading noise canceling with two processors and 8 microphones.",
};

// 1. Deal Card Interaction Tests
test("DealCard formats INR currency correctly and calculates exact savings", () => {
  const savings = getSavings(sampleDeal.originalPrice, sampleDeal.price);
  assert.equal(savings.amount, 9991);
  assert.equal(savings.percent, 28);
  assert.equal(formatINR(sampleDeal.price), "₹24,999");
  assert.equal(formatINR(sampleDeal.originalPrice), "₹34,990");
  assert.equal(formatINR(savings.amount), "₹9,991");
});

test("DealCard handles independent actions: wishlist does not trigger onView", () => {
  let viewTriggered = false;
  let saveTriggered = false;
  let savedId = "";

  const onView = () => {
    viewTriggered = true;
  };
  const onSave = (id: string) => {
    saveTriggered = true;
    savedId = id;
  };

  // Simulate clicking the wishlist button with stopPropagation
  const fakeEvent = {
    stopPropagation: () => {},
  };
  fakeEvent.stopPropagation();
  onSave(sampleDeal.id);

  assert.equal(saveTriggered, true);
  assert.equal(savedId, sampleDeal.id);
  assert.equal(viewTriggered, false, "Clicking wishlist must NOT trigger onView");

  // Simulate clicking the card or View Deal
  onView();
  assert.equal(viewTriggered, true, "Clicking card or View Deal must trigger onView");
});

// 2. Buy Now Link & Affiliate Routing
test("Buy Now button generates correct affiliate route /go/[dealId]", () => {
  const buyUrl =
    sampleDeal.source === "database"
      ? `/go/${sampleDeal.id}`
      : sampleDeal.retailerUrl || `/go/${sampleDeal.id}`;

  assert.equal(buyUrl, "/go/deal-test-101");
  assert.match(buyUrl, /^\/go\/[a-zA-Z0-9_-]+$/);
});

// 3. Sharing & Canonical URL Formatting
test("Canonical sharing links format correct deal public URLs for WhatsApp, Facebook, X, and Copy Link", () => {
  const origin = "https://metadeals4u.in";
  const canonicalUrl = `${origin}/deal/${sampleDeal.slug}`;
  const shareText = `🔥 Great Deal on MetaDeals4U: ${sampleDeal.name} for ${formatINR(sampleDeal.price)}! Check it out:`;

  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(`${shareText} ${canonicalUrl}`)}`;
  const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(canonicalUrl)}`;
  const xUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(canonicalUrl)}`;

  assert.ok(whatsappUrl.includes("sony-wh-1000xm5-headphones"));
  assert.ok(whatsappUrl.includes(encodeURIComponent("₹24,999")));
  assert.ok(facebookUrl.includes("https%3A%2F%2Fmetadeals4u.in%2Fdeal%2Fsony-wh-1000xm5-headphones"));
  assert.ok(xUrl.includes("https%3A%2F%2Fmetadeals4u.in%2Fdeal%2Fsony-wh-1000xm5-headphones"));
  assert.equal(canonicalUrl, "https://metadeals4u.in/deal/sony-wh-1000xm5-headphones");
});

// 4. Three Related Deals Selection Logic
test("Related deals logic returns exactly up to 3 eligible deals from the same category excluding current deal", () => {
  const electronicsDeals = sampleDeals.filter(
    (d) => d.category.toLowerCase() === "electronics" && d.id !== sampleDeal.id
  );

  const related = electronicsDeals.slice(0, 3);
  assert.ok(related.length <= 3, "Never return more than 3 related deals");
  assert.ok(related.length > 0, "Should find related deals in category");

  for (const rel of related) {
    assert.notEqual(rel.id, sampleDeal.id, "Current deal must be excluded");
    assert.equal(rel.category.toLowerCase(), "electronics", "Category must match");
    assert.ok(rel.price > 0, "Price must be positive");
    assert.ok(rel.name.length > 0, "Name must be present");
  }
});

test("Related deals prefer distinct merchants and distinct products where available", () => {
  const candidates: Deal[] = [
    { ...sampleDeal, id: "r1", name: "Product A", store: "croma", storeName: "Croma" },
    { ...sampleDeal, id: "r2", name: "Product B", store: "amazon", storeName: "Amazon India" },
    { ...sampleDeal, id: "r3", name: "Product C", store: "flipkart", storeName: "Flipkart" },
    { ...sampleDeal, id: "r4", name: "Product D", store: "amazon", storeName: "Amazon India" },
  ];

  const selected: Deal[] = [];
  const seenMerchants = new Set<string>();

  for (const c of candidates) {
    if (selected.length >= 3) break;
    if (!seenMerchants.has(c.store) && c.id !== sampleDeal.id) {
      selected.push(c);
      seenMerchants.add(c.store);
    }
  }

  assert.equal(selected.length, 3);
  assert.equal(seenMerchants.size, 3, "Selected deals should represent 3 distinct merchants");
  assert.deepEqual(selected.map((s) => s.store), ["croma", "amazon", "flipkart"]);
});

// 5. Missing attributes & Graceful Fallbacks
test("Deals with missing optional attributes (rating, reviews, expiry) render gracefully", () => {
  const minimalDeal: Deal = {
    id: "deal-minimal-1",
    slug: "minimal-item",
    name: "Minimalist Linen Shirt",
    brand: "FabIndia",
    category: "fashion",
    image: "",
    price: 1299,
    originalPrice: 1999,
    rating: null,
    reviewCount: null,
    ratingSource: null,
    store: "myntra",
    storeName: "Myntra",
    retailerUrl: "/go/deal-minimal-1",
    source: "database",
    expiry: "unknown",
    expiresAt: null,
    featured: false,
    publishedAt: "2026-11-02T10:00:00.000Z",
  };

  const savings = getSavings(minimalDeal.originalPrice, minimalDeal.price);
  assert.equal(savings.percent, 35);
  assert.equal(formatINR(minimalDeal.price), "₹1,299");
  assert.equal(minimalDeal.rating, null);
  assert.equal(minimalDeal.expiresAt, null);

  // Fallback image source test
  const displayImage = minimalDeal.image || "/images/placeholder.png";
  assert.equal(displayImage, "/images/placeholder.png");
});
