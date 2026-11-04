import { getDatabase } from "../src/server/db/client";
import { productExtractionService } from "../src/server/product-extraction/core/service";
import assert from "node:assert/strict";

async function main() {
  console.log("--- Starting Multi-Retailer Product Extraction Integration Test ---");
  const db = getDatabase();

  const admin = await db.user.findFirst({ where: { role: "SUPER_ADMIN" } });
  if (!admin) {
    throw new Error("No super admin found for test.");
  }

  // 1. Test Amazon URL extraction
  console.log("1. Testing Amazon India URL extraction...");
  const amazonResult = await productExtractionService.extractProduct({
    url: "https://www.amazon.in/gp/product/B0CWVFGGQM",
    actorId: admin.id,
  });

  assert.equal(amazonResult.retailer, "Amazon India");
  assert.equal(amazonResult.data.identity.asin.value, "B0CWVFGGQM");
  assert.equal(amazonResult.matchedTaxonomy?.merchantName, "Amazon India");
  console.log(`✓ Amazon ASIN extracted: ${amazonResult.data.identity.asin.value}, Status: ${amazonResult.status}`);

  // 2. Test Flipkart URL extraction
  console.log("2. Testing Flipkart URL extraction...");
  const flipkartUrl = "https://www.flipkart.com/samsung-galaxy-s25-fe-5g-jetblack-128-gb/p/itm90e887b150eea?pid=MOBHQCH6FPTX5FZ2&lid=LSTMOBHQCH6FPTX5FZ26HBEZT";
  const flipkartResult = await productExtractionService.extractProduct({
    url: flipkartUrl,
    actorId: admin.id,
  });

  assert.equal(flipkartResult.retailer, "Flipkart");
  assert.equal(flipkartResult.data.identity.flipkartPid.value, "MOBHQCH6FPTX5FZ2");
  assert.equal(flipkartResult.data.identity.brand.value, "Samsung");
  assert.equal(flipkartResult.data.identity.storageRam.value, "128 GB");
  assert.equal(flipkartResult.matchedTaxonomy?.merchantName, "Flipkart");
  assert.equal(flipkartResult.matchedTaxonomy?.categoryName, "Mobiles & Tablets");
  console.log(`✓ Flipkart PID extracted: ${flipkartResult.data.identity.flipkartPid.value}, Brand: ${flipkartResult.data.identity.brand.value}`);

  // 3. Test Myntra URL extraction
  console.log("3. Testing Myntra URL extraction...");
  const myntraUrl = "https://www.myntra.com/kurtas/house+pataudi/house-of-pataudi-embellished-mandarin-collar-ethnic-wear-kurta/31647768/buy";
  const myntraResult = await productExtractionService.extractProduct({
    url: myntraUrl,
    actorId: admin.id,
  });

  assert.equal(myntraResult.retailer, "Myntra");
  assert.equal(myntraResult.data.identity.sku.value, "31647768");
  assert.equal(myntraResult.data.identity.brand.value, "House of Pataudi");
  assert.equal(myntraResult.matchedTaxonomy?.merchantName, "Myntra");
  console.log(`✓ Myntra Style ID: ${myntraResult.data.identity.sku.value}, Brand: ${myntraResult.data.identity.brand.value}`);

  // 4. Test Dedicated Croma URL & Layered Extraction with Pricing
  console.log("4. Testing dedicated Croma URL & layered extraction with pricing...");
  const cromaUrl = "https://www.croma.com/p/324687";
  const fixtureHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta property="og:title" content="Sony Bravia 139 cm 4K Google TV" />
        <meta property="og:image" content="https://media.croma.com/image/upload/v1/324687.jpg" />
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Product",
          "name": "Sony Bravia 139 cm (55 inch) 4K Ultra HD Smart Google TV",
          "brand": { "@type": "Brand", "name": "Sony" },
          "description": "Immersive 4K Google TV with 4K Processor X1 and Dolby Audio.",
          "sku": "324687",
          "mpn": "KD-55X74L",
          "image": "https://media.croma.com/image/upload/v1/324687-main.jpg",
          "offers": {
            "@type": "Offer",
            "price": "57990.00",
            "priceCurrency": "INR"
          },
          "aggregateRating": {
            "@type": "AggregateRating",
            "ratingValue": "4.7",
            "reviewCount": "890"
          }
        }
        </script>
      </head>
      <body>
        <span class="pdp-cp-price">₹57,990</span>
        <span class="pdp-mrp">₹99,900</span>
      </body>
    </html>
  `;

  const cromaResult = await productExtractionService.extractProduct({
    url: cromaUrl,
    actorId: admin.id,
    htmlFixture: fixtureHtml,
  });

  assert.equal(cromaResult.retailer, "Croma");
  assert.equal(cromaResult.data.identity.cromaPid?.value, "324687");
  assert.equal(cromaResult.data.identity.title.value, "Sony Bravia 139 cm (55 inch) 4K Ultra HD Smart Google TV");
  assert.equal(cromaResult.data.identity.brand.value, "Sony");
  assert.equal(cromaResult.data.pricing.priceRupees.value, 57990);
  assert.equal(cromaResult.data.pricing.priceMinor.value, 5799000);
  assert.equal(cromaResult.data.pricing.mrpRupees.value, 99900);
  assert.equal(cromaResult.data.pricing.mrpMinor.value, 9990000);
  assert.equal(cromaResult.data.ratings.rating.value, 4.7);
  assert.equal(cromaResult.data.ratings.reviewCount.value, 890);
  assert.equal(cromaResult.data.content.description.value, "Immersive 4K Google TV with 4K Processor X1 and Dolby Audio.");
  assert.equal(cromaResult.suggestedFormValues?.priceRupees, "57990");
  assert.equal(cromaResult.suggestedFormValues?.mrpRupees, "99900");
  console.log(`✓ Croma PID 324687: Title: "${cromaResult.data.identity.title.value}", Brand: ${cromaResult.data.identity.brand.value}, Price: ₹${cromaResult.data.pricing.priceRupees.value}, MRP: ₹${cromaResult.data.pricing.mrpRupees.value}`);

  // 5. Test layered Myntra extraction with window.__myx embedded JSON state
  console.log("5. Testing Myntra layered extraction with embedded window.__myx state...");
  const myntraFixtureHtml = `
    <html>
      <head>
        <title>Buy House of Pataudi Men Kurta</title>
      </head>
      <body>
        <script>
          window.__myx = {
            "pdpData": {
              "name": "Men Mandarin Collar Ethnic Wear Kurta",
              "brand": { "name": "House of Pataudi" },
              "price": { "discounted": 1499, "mrp": 2999 },
              "media": {
                "albums": [
                  { "images": [{ "imageURL": "https://assets.myntassets.com/h_1440,q_90,w_1080/v1/assets/images/31647768/kurta.jpg" }] }
                ]
              },
              "ratings": { "averageRating": 4.4, "totalCount": 540 }
            }
          };
        </script>
      </body>
    </html>
  `;
  const myntraLayered = await productExtractionService.extractProduct({
    url: myntraUrl,
    actorId: admin.id,
    htmlFixture: myntraFixtureHtml,
  });

  assert.equal(myntraLayered.retailer, "Myntra");
  assert.equal(myntraLayered.data.identity.brand.value, "House of Pataudi");
  assert.equal(myntraLayered.data.pricing.priceRupees.value, 1499);
  assert.equal(myntraLayered.data.pricing.mrpRupees.value, 2999);
  assert.equal(myntraLayered.data.pricing.priceMinor.value, 149900);
  assert.equal(myntraLayered.data.pricing.mrpMinor.value, 299900);
  assert.equal(myntraLayered.data.media.primaryImageUrl.value, "https://assets.myntassets.com/h_1440,q_90,w_1080/v1/assets/images/31647768/kurta.jpg");
  assert.equal(myntraLayered.data.ratings.rating.value, 4.4);
  assert.equal(myntraLayered.data.ratings.reviewCount.value, 540);
  console.log(`✓ Myntra embedded state: Brand: ${myntraLayered.data.identity.brand.value}, Price: ₹${myntraLayered.data.pricing.priceRupees.value}, Ratings: ${myntraLayered.data.ratings.rating.value}`);

  // 6. Verify zero placeholder description guarantee
  console.log("6. Verifying zero placeholder description guarantee...");
  if (amazonResult.data.content.description.value) {
    assert.doesNotMatch(amazonResult.data.content.description.value, /identified from/i);
    assert.doesNotMatch(amazonResult.data.content.description.value, /amazon product/i);
    console.log(`✓ Real Amazon description retrieved from live HTML: "${amazonResult.data.content.description.value.slice(0, 60)}..."`);
  }
  const { AmazonIndiaAdapter } = await import("../src/server/product-extraction/adapters/amazon-india");
  const amazonAdapter = new AmazonIndiaAdapter();
  const amazonNoHtml = await amazonAdapter.extract({
    url: new URL("https://www.amazon.in/dp/B0CWVFGGQM"),
    rawUrl: "https://www.amazon.in/dp/B0CWVFGGQM",
  });
  assert.equal(amazonNoHtml.content.description.value, null, "Amazon adapter without HTML must have null description");

  if (flipkartResult.data.content.description.value) {
    assert.doesNotMatch(flipkartResult.data.content.description.value, /identified from/i);
    assert.doesNotMatch(flipkartResult.data.content.description.value, /flipkart product/i);
  }
  const { FlipkartAdapter } = await import("../src/server/product-extraction/adapters/flipkart");
  const flipkartAdapter = new FlipkartAdapter();
  const flipkartNoHtml = await flipkartAdapter.extract({
    url: new URL(flipkartUrl),
    rawUrl: flipkartUrl,
  });
  assert.equal(flipkartNoHtml.content.description.value, null, "Flipkart adapter without HTML must have null description");
  console.log("✓ Zero placeholder description guarantee strictly enforced.");

  // 7. Verify database audit logs
  console.log("7. Verifying ProductExtractionLog records in database...");
  const logs = await db.productExtractionLog.findMany({
    where: { adminUserId: admin.id },
    orderBy: { createdAt: "desc" },
    take: 6,
  });

  assert.ok(logs.length >= 4, "Expected at least 4 extraction log entries");
  console.log(`✓ Found ${logs.length} logged extraction attempts with audit verification.`);

  console.log("--- All Multi-Retailer Product Extraction Integration Tests Passed! ---");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Test failed:", e);
    process.exit(1);
  });

