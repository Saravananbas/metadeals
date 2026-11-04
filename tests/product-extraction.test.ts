import assert from "node:assert/strict";
import test from "node:test";
import { validateProductUrl, cleanProductUrl, isPrivateOrLoopbackHost } from "../src/server/product-extraction/security/url-validator";
import { isAllowedRetailerDomain, findAllowedDomain } from "../src/server/product-extraction/security/domain-allowlist";
import { adapterRegistry } from "../src/server/product-extraction/core/registry";
import { AmazonIndiaAdapter } from "../src/server/product-extraction/adapters/amazon-india";
import { FlipkartAdapter } from "../src/server/product-extraction/adapters/flipkart";
import { MyntraAdapter } from "../src/server/product-extraction/adapters/myntra";
import { CromaAdapter } from "../src/server/product-extraction/adapters/croma";
import { GenericStructuredDataAdapter } from "../src/server/product-extraction/adapters/generic-structured-data";
import { parseJsonLd, parseOpenGraph, parseHtmlMetadata, parseEmbeddedJson, parseTitleToBrand, cleanDescription } from "../src/server/product-extraction/adapters/base";
import { generateStableSlug } from "../src/server/product-extraction/core/normalizer";
import { sanitizeExtractedText } from "../src/server/product-extraction/security/fetch-policy";

// 1. URL Identification and Retailer Detection Tests
test("Amazon URL identification extracts ASIN accurately", () => {
  const adapter = new AmazonIndiaAdapter();

  const url1 = new URL("https://www.amazon.in/gp/product/B0CWVFGGQM");
  assert.equal(adapter.canHandle(url1), true);
  assert.equal(adapter.extractAsin(url1), "B0CWVFGGQM");

  const url2 = new URL("https://www.amazon.in/dp/B0CWVFGGQM?ref_=ast_sto_dp");
  assert.equal(adapter.canHandle(url2), true);
  assert.equal(adapter.extractAsin(url2), "B0CWVFGGQM");

  const url3 = new URL("https://amzn.in/d/b0cwvfggqm");
  assert.equal(adapter.canHandle(url3), true);
});

test("Flipkart URL identification extracts PID and product attributes", () => {
  const adapter = new FlipkartAdapter();

  const raw = "https://www.flipkart.com/samsung-galaxy-s25-fe-5g-jetblack-128-gb/p/itm90e887b150eea?pid=MOBHQCH6FPTX5FZ2&lid=LSTMOBHQCH6FPTX5FZ26HBEZT";
  const url = new URL(raw);

  assert.equal(adapter.canHandle(url), true);
  assert.equal(adapter.extractPid(url), "MOBHQCH6FPTX5FZ2");

  const info = adapter.extractProductInfoFromPath(url.pathname);
  assert.equal(info.brand, "Samsung");
  assert.equal(info.colour, "Jetblack");
  assert.equal(info.storage, "128 GB");
  assert.match(info.title, /Samsung Galaxy S25 Fe 5G/i);
});

test("Myntra URL identification extracts style ID, brand and title", () => {
  const adapter = new MyntraAdapter();

  const raw = "https://www.myntra.com/kurtas/house+pataudi/house-of-pataudi-embellished-mandarin-collar-ethnic-wear-kurta/31647768/buy";
  const url = new URL(raw);

  assert.equal(adapter.canHandle(url), true);
  assert.equal(adapter.extractStyleId(url), "31647768");

  const info = adapter.extractInfoFromPath(url.pathname);
  assert.equal(info.brand, "House of Pataudi");
  assert.equal(info.styleId, "31647768");
  assert.equal(info.category, "Fashion (Men)");
  assert.match(info.title, /House Of Pataudi Embellished Mandarin Collar Ethnic Wear Kurta/i);
});

test("Adapter registry routes URLs to the correct retailer adapter", () => {
  const amazonUrl = new URL("https://www.amazon.in/gp/product/B0CWVFGGQM");
  const flipkartUrl = new URL("https://www.flipkart.com/samsung-galaxy-s25-fe-5g/p/itm90e887b150eea?pid=MOBHQCH6FPTX5FZ2");
  const myntraUrl = new URL("https://www.myntra.com/kurtas/house+pataudi/kurta/31647768/buy");
  const cromaUrl = new URL("https://www.croma.com/apple-iphone-15/p/272304");

  assert.equal(adapterRegistry.findAdapterForUrl(amazonUrl)?.id, "amazon-india");
  assert.equal(adapterRegistry.findAdapterForUrl(flipkartUrl)?.id, "flipkart");
  assert.equal(adapterRegistry.findAdapterForUrl(myntraUrl)?.id, "myntra");
  assert.equal(adapterRegistry.findAdapterForUrl(cromaUrl)?.id, "croma");

  const relianceUrl = new URL("https://www.reliancedigital.in/item/12345");
  assert.equal(adapterRegistry.findAdapterForUrl(relianceUrl)?.id, "generic-structured-data");

  const unknownUrl = new URL("https://www.unauthorized-scam-store.com/item/123");
  assert.equal(adapterRegistry.findAdapterForUrl(unknownUrl), undefined);
});

test("domain allowlist correctly identifies approved Indian retail domains", () => {
  assert.equal(isAllowedRetailerDomain("amazon.in"), true);
  assert.equal(isAllowedRetailerDomain("www.flipkart.com"), true);
  assert.equal(isAllowedRetailerDomain("myntra.com"), true);
  assert.equal(isAllowedRetailerDomain("croma.com"), true);
  assert.equal(isAllowedRetailerDomain("evil-site.com"), false);

  const found = findAllowedDomain("www.amazon.in");
  assert.equal(found?.retailerSlug, "amazon");
});

// 2. Security & SSRF Protection Tests
test("validateProductUrl enforces HTTPS, allows recognized domains, and blocks invalid schemes", () => {
  // Valid HTTPS
  const validAmazon = validateProductUrl("https://www.amazon.in/gp/product/B0CWVFGGQM");
  assert.equal(validAmazon.valid, true);
  assert.equal(validAmazon.retailerName, "Amazon India");

  const validFlipkart = validateProductUrl("https://www.flipkart.com/samsung-galaxy/p/itm123?pid=MOB1234567890123");
  assert.equal(validFlipkart.valid, true);
  assert.equal(validFlipkart.retailerName, "Flipkart");

  // Insecure schemes
  const ftp = validateProductUrl("ftp://www.amazon.in/product/123");
  assert.equal(ftp.valid, false);
  assert.match(ftp.error ?? "", /secure HTTPS/i);

  const js = validateProductUrl("javascript:alert(1)");
  assert.equal(js.valid, false);

  // User credentials in URL
  const credentials = validateProductUrl("https://admin:secret@www.amazon.in/product/123");
  assert.equal(credentials.valid, false);
  assert.match(credentials.error ?? "", /credentials/i);

  // Unknown unapproved domain
  const unknown = validateProductUrl("https://www.evil-malicious-site.com/item");
  assert.equal(unknown.valid, false);
  assert.match(unknown.error ?? "", /not supported/i);

  // Empty and malformed
  assert.equal(validateProductUrl("").valid, false);
  assert.equal(validateProductUrl("not-a-url").valid, false);
});

test("SSRF protection blocks private IP ranges, link-local, and loopback addresses", () => {
  assert.equal(isPrivateOrLoopbackHost("127.0.0.1"), true);
  assert.equal(isPrivateOrLoopbackHost("10.0.1.5"), true);
  assert.equal(isPrivateOrLoopbackHost("172.16.0.1"), true);
  assert.equal(isPrivateOrLoopbackHost("192.168.1.1"), true);
  assert.equal(isPrivateOrLoopbackHost("169.254.169.254"), true); // AWS / GCP metadata IP
  assert.equal(isPrivateOrLoopbackHost("::1"), true);

  assert.equal(isPrivateOrLoopbackHost("amazon.in"), false);
  assert.equal(isPrivateOrLoopbackHost("flipkart.com"), false);
  assert.equal(isPrivateOrLoopbackHost("myntra.com"), false);
});

test("cleanProductUrl strips tracking and affiliate parameters while preserving product identity", () => {
  const dirty = "https://www.amazon.in/dp/B0CWVFGGQM?tag=affiliate-21&ascsubtag=xyz123&utm_source=google&ref_=as_li_ss_tl";
  const cleaned = cleanProductUrl(dirty);
  assert.equal(cleaned, "https://www.amazon.in/dp/B0CWVFGGQM");

  const flipkartDirty = "https://www.flipkart.com/p/p?pid=MOBHQCH6FPTX5FZ2&affid=aff123&utm_medium=cpc";
  const flipkartCleaned = cleanProductUrl(flipkartDirty);
  assert.equal(flipkartCleaned, "https://www.flipkart.com/p/p?pid=MOBHQCH6FPTX5FZ2");
});

// 3. Retailer Authorization & Restricted Connector Behaviour
test("Amazon adapter enforces PA-API authorization policy and fails safely with manual fallback", async () => {
  const adapter = new AmazonIndiaAdapter();
  const auth = await adapter.checkAuthorization();

  // In test environment without PA-API credentials:
  assert.equal(auth.authorized, false);
  assert.equal(auth.status, "AUTHORIZATION_REQUIRED");
  assert.match(auth.reason ?? "", /Amazon India Conditions of Use/i);

  // Extraction from live URL without credentials returns URL identifiers and restricted pricing with manual fallback
  const extraction = await adapter.extract({
    url: new URL("https://www.amazon.in/gp/product/B0CWVFGGQM"),
    rawUrl: "https://www.amazon.in/gp/product/B0CWVFGGQM",
  });

  assert.equal(extraction.identity.asin.value, "B0CWVFGGQM");
  assert.equal(extraction.merchant.retailerName, "Amazon India");
  assert.equal(extraction.pricing.priceMinor.confidence, "RESTRICTED");
  assert.equal(extraction.pricing.mrpMinor.confidence, "RESTRICTED");
  assert.match(extraction.pricing.priceMinor.note ?? "", /manual/i);
});

test("Flipkart adapter extracts PID from URL and marks dynamic price for manual review", async () => {
  const adapter = new FlipkartAdapter();
  const extraction = await adapter.extract({
    url: new URL("https://www.flipkart.com/samsung-galaxy-s25-fe-5g-jetblack-128-gb/p/itm90e887b150eea?pid=MOBHQCH6FPTX5FZ2"),
    rawUrl: "https://www.flipkart.com/samsung-galaxy-s25-fe-5g-jetblack-128-gb/p/itm90e887b150eea?pid=MOBHQCH6FPTX5FZ2",
  });

  assert.equal(extraction.identity.flipkartPid.value, "MOBHQCH6FPTX5FZ2");
  assert.equal(extraction.identity.brand.value, "Samsung");
  assert.equal(extraction.identity.colour.value, "Jetblack");
  assert.equal(extraction.identity.storageRam.value, "128 GB");
  assert.equal(extraction.pricing.priceMinor.confidence, "RESTRICTED");
  assert.match(extraction.pricing.priceMinor.note ?? "", /manual/i);
});

// 4. Authorized Structured Data & Fixture Parsing
test("Structured data parser extracts JSON-LD Product with prices and ratings accurately", () => {
  const ogHtml = '<meta property="og:title" content="boAt Rockerz 450" /><meta property="og:description" content="Wireless Bluetooth Headphone" /><meta property="og:image" content="https://img.example.com/boat.jpg" /><meta property="product:price:amount" content="1499.00" />';
  const og = parseOpenGraph(ogHtml);
  assert.equal(og.title, "boAt Rockerz 450");
  assert.equal(og.description, "Wireless Bluetooth Headphone");
  assert.equal(og.image, "https://img.example.com/boat.jpg");
  assert.equal(og.price, 1499);

  assert.equal(parseTitleToBrand("Samsung Galaxy S24 Ultra"), "Samsung");
  assert.equal(parseTitleToBrand("Apple iPhone 16 Pro"), "Apple");
  assert.equal(parseTitleToBrand("Sony WH-1000XM5"), "Sony");
  assert.equal(parseTitleToBrand("House of Pataudi Men Kurta"), "House of Pataudi");
  assert.equal(parseTitleToBrand("Random Unbranded Item"), undefined);
  const sampleHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta property="og:title" content="Samsung Galaxy S25 FE 5G" />
        <meta property="og:description" content="Latest flagship phone with AI features" />
        <meta property="og:image" content="https://img.example.com/s25.webp" />
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Product",
          "name": "Samsung Galaxy S25 FE 5G",
          "brand": { "@type": "Brand", "name": "Samsung" },
          "description": "Powerful 5G smartphone with high-end camera",
          "sku": "SAM-S25-128",
          "mpn": "SM-S721B",
          "gtin13": "8806095000000",
          "category": "Mobiles & Tablets",
          "image": "https://img.example.com/s25-hd.webp",
          "offers": {
            "@type": "Offer",
            "price": "49999.00",
            "priceCurrency": "INR",
            "availability": "https://schema.org/InStock"
          },
          "aggregateRating": {
            "@type": "AggregateRating",
            "ratingValue": "4.5",
            "reviewCount": "1280"
          }
        }
        </script>
      </head>
      <body></body>
    </html>
  `;

  const parsed = parseJsonLd(sampleHtml);
  assert.equal(parsed.name, "Samsung Galaxy S25 FE 5G");
  assert.equal(parsed.brand, "Samsung");
  assert.equal(parsed.sku, "SAM-S25-128");
  assert.equal(parsed.mpn, "SM-S721B");
  assert.equal(parsed.gtin, "8806095000000");
  assert.equal(parsed.price, 49999);
  assert.equal(parsed.currency, "INR");
  assert.equal(parsed.ratingValue, 4.5);
  assert.equal(parsed.reviewCount, 1280);
  assert.equal(parsed.image, "https://img.example.com/s25-hd.webp");
});

test("Authorized adapter extracts high-confidence fields from fixture HTML", async () => {
  const adapter = new GenericStructuredDataAdapter();
  const fixture = `
    <html>
      <head>
        <script type="application/ld+json">
        {
          "@type": "Product",
          "name": "Apple MacBook Air M3 (16GB, 512GB SSD)",
          "brand": "Apple",
          "description": "Supercharged by the next-generation M3 chip.",
          "offers": {
            "price": "114900",
            "priceCurrency": "INR"
          },
          "aggregateRating": {
            "ratingValue": "4.8",
            "reviewCount": "430"
          }
        }
        </script>
      </head>
    </html>
  `;

  const extraction = await adapter.extract({
    url: new URL("https://www.croma.com/apple-macbook-air-m3/p/305212"),
    rawUrl: "https://www.croma.com/apple-macbook-air-m3/p/305212",
    htmlFixture: fixture,
  });

  assert.equal(extraction.identity.title.value, "Apple MacBook Air M3 (16GB, 512GB SSD)");
  assert.equal(extraction.identity.brand.value, "Apple");
  assert.equal(extraction.pricing.priceRupees.value, 114900);
  assert.equal(extraction.pricing.priceMinor.value, 11490000); // Converted to paise
  assert.equal(extraction.pricing.currency.value, "INR");
  assert.equal(extraction.ratings.rating.value, 4.8);
  assert.equal(extraction.ratings.reviewCount.value, 430);
});

// 5. Normalizer and Slug Generation Tests
test("generateStableSlug generates valid URL slugs complying with slugSchema", () => {
  const slug1 = generateStableSlug("Samsung Galaxy S25 FE 5G (Jetblack, 128 GB)", "Samsung", "MOBHQCH6FPTX5FZ2");
  assert.match(slug1, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert.ok(slug1.includes("samsung"));
  assert.ok(slug1.includes("galaxy"));

  const slug2 = generateStableSlug("House of Pataudi Embellished Mandarin Collar Ethnic Wear Kurta", "House of Pataudi", "31647768");
  assert.match(slug2, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert.ok(slug2.includes("pataudi"));
  assert.ok(slug2.length <= 100);
});

// 6. Sanitization Tests
test("sanitizeExtractedText strips dangerous HTML script tags, event handlers, and decodes entities", () => {
  const dirty = '<script>alert("hack")</script><b>Sony</b> WH-1000XM5 &amp; Wireless Headphones <img src="x" onerror="evil()">';
  const clean = sanitizeExtractedText(dirty);
  assert.equal(clean, "Sony WH-1000XM5 & Wireless Headphones");
  assert.doesNotMatch(clean, /<script|alert|onerror/);
});

// 7. Croma Dedicated Adapter & Layered Extraction Tests
test("Croma adapter identifies product ID and extracts details from layered HTML", async () => {
  const adapter = new CromaAdapter();

  const url = new URL("https://www.croma.com/p/324687");
  assert.equal(adapter.canHandle(url), true);
  assert.equal(adapter.extractProductId(url), "324687");

  const longUrl = new URL("https://www.croma.com/sony-bravia-139-cm-55-inch-4k-ultra-hd-smart-google-tv/p/324687");
  assert.equal(adapter.extractProductId(longUrl), "324687");

  const fixtureHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta property="og:title" content="Sony Bravia 139 cm 4K Ultra HD Smart TV" />
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

  const extraction = await adapter.extract({
    url: longUrl,
    rawUrl: longUrl.toString(),
    htmlFixture: fixtureHtml,
  });

  assert.equal(extraction.merchant.retailerName, "Croma");
  assert.equal(extraction.identity.cromaPid?.value, "324687");
  assert.equal(extraction.identity.title.value, "Sony Bravia 139 cm (55 inch) 4K Ultra HD Smart Google TV");
  assert.equal(extraction.identity.brand.value, "Sony");
  assert.equal(extraction.content.description.value, "Immersive 4K Google TV with 4K Processor X1 and Dolby Audio.");
  assert.equal(extraction.pricing.priceRupees.value, 57990);
  assert.equal(extraction.pricing.priceMinor.value, 5799000); // 5799000 paise
  assert.equal(extraction.pricing.mrpRupees.value, 99900); // Parsed from selector
  assert.equal(extraction.media.primaryImageUrl.value, "https://media.croma.com/image/upload/v1/324687-main.jpg");
  assert.equal(extraction.ratings.rating.value, 4.7);
  assert.equal(extraction.ratings.reviewCount.value, 890);
  assert.equal(extraction.merchant.canonicalUrl, "https://www.croma.com/p/324687");
});

// 8. Layered Parsing: JSON-LD @graph and Embedded State Tests
test("Layered parser extracts complex @graph JSON-LD and ImageObject correctly", () => {
  const complexJsonLd = `
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Organization",
          "name": "Tata Croma",
          "url": "https://www.croma.com"
        },
        {
          "@type": "Product",
          "name": "Apple iPhone 16 (128GB, Teal)",
          "brand": { "@type": "Brand", "name": "Apple" },
          "description": "Built for Apple Intelligence with Camera Control.",
          "image": {
            "@type": "ImageObject",
            "url": "https://img.croma.com/iphone16.jpg"
          },
          "offers": {
            "@type": "AggregateOffer",
            "lowPrice": "74900",
            "highPrice": "79900",
            "priceCurrency": "INR"
          }
        }
      ]
    }
    </script>
  `;

  const parsed = parseJsonLd(complexJsonLd);
  assert.equal(parsed.name, "Apple iPhone 16 (128GB, Teal)");
  assert.equal(parsed.brand, "Apple");
  assert.equal(parsed.image, "https://img.croma.com/iphone16.jpg");
  assert.equal(parsed.price, 74900);
  assert.equal(parsed.currency, "INR");
});

test("cleanDescription strictly rejects generic placeholder boilerplate", () => {
  assert.equal(cleanDescription("Amazon item identified from URL. Verify details before publishing."), null);
  assert.equal(cleanDescription("Product identified from Flipkart listing MOB12345"), null);
  assert.equal(cleanDescription("Croma Product"), null);
  assert.equal(cleanDescription(""), null);
  assert.equal(cleanDescription("    "), null);
  assert.equal(cleanDescription("abc"), null); // Too short

  // Genuine descriptions are preserved
  const realDesc = "Crafted in breathable cotton, this printed kurta features a mandarin collar and side slits.";
  assert.equal(cleanDescription(realDesc), realDesc);
});

test("parseHtmlMetadata extracts standard meta tags, microdata, and title accurately", () => {
  const metaHtml = `
    <html>
      <head>
        <title>OnePlus 12 (Emerald Green, 256 GB) Online at Best Price</title>
        <meta name="description" content="Buy OnePlus 12 with 50MP Hasselblad camera and 5400mAh battery." />
        <link rel="canonical" href="https://www.example.com/oneplus-12" />
      </head>
      <body>
        <span itemprop="price">64999</span>
        <span itemprop="brand">OnePlus</span>
      </body>
    </html>
  `;
  const meta = parseHtmlMetadata(metaHtml);
  assert.equal(meta.title, "OnePlus 12 (Emerald Green, 256 GB)");
  assert.equal(meta.description, "Buy OnePlus 12 with 50MP Hasselblad camera and 5400mAh battery.");
  assert.equal(meta.canonicalUrl, "https://www.example.com/oneplus-12");
  assert.equal(meta.price, 64999);
  assert.equal(meta.brand, "OnePlus");
});

test("parseEmbeddedJson safely extracts Next.js and Myntra window.__myx state without script execution", () => {
  const nextDataHtml = `
    <html>
      <script id="__NEXT_DATA__" type="application/json">
      {
        "props": {
          "pageProps": {
            "initialData": {
              "product": {
                "name": "Sony Wireless Headphones",
                "brand": "Sony",
                "price": { "value": 19990, "mrp": 29990 },
                "images": ["https://img.example.com/sony1.jpg", "https://img.example.com/sony2.jpg"]
              }
            }
          }
        }
      }
      </script>
    </html>
  `;

  const nextParsed = parseEmbeddedJson(nextDataHtml);
  assert.equal(nextParsed.title, "Sony Wireless Headphones");
  assert.equal(nextParsed.brand, "Sony");
  assert.equal(nextParsed.price, 19990);
  assert.equal(nextParsed.mrp, 29990);
  assert.equal(nextParsed.image, "https://img.example.com/sony1.jpg");

  const myntraHtml = `
    <script>
      window.__myx = {
        "pdpData": {
          "name": "Men Mandarin Collar Kurta",
          "brand": { "name": "House of Pataudi" },
          "price": { "discounted": 1499, "mrp": 2999 },
          "ratings": { "averageRating": 4.3, "totalCount": 210 }
        }
      };
    </script>
  `;

  const myxParsed = parseEmbeddedJson(myntraHtml);
  assert.equal(myxParsed.title, "Men Mandarin Collar Kurta");
  assert.equal(myxParsed.brand, "House of Pataudi");
  assert.equal(myxParsed.price, 1499);
  assert.equal(myxParsed.mrp, 2999);
  assert.equal(myxParsed.ratingValue, 4.3);
  assert.equal(myxParsed.reviewCount, 210);
});
