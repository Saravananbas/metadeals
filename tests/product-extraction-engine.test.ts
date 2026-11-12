import assert from "node:assert/strict";
import test from "node:test";
import { GenericStructuredDataAdapter } from "../src/server/product-extraction/adapters/generic-structured-data";
import { applyDeterministicFieldFallback } from "../src/server/product-extraction/core/strategy-engine";
import { restrictedField } from "../src/server/product-extraction/core/confidence";

const rawUrl = "https://shop.example.in/p/phone";
const context = { url: new URL(rawUrl), rawUrl };

const fixture = `
<html><head>
  <script type="application/ld+json">
    {"@type":"Product","name":"Fallback Phone","brand":{"@type":"Brand","name":"Example Brand"},"image":["https://cdn.example.in/a.webp","https://cdn.example.in/b.webp"],"offers":{"price":"0","priceCurrency":"INR"}}
  </script>
  <script id="__NEXT_DATA__" type="application/json">
    {"props":{"pageProps":{"product":{"name":"Embedded Phone","brand":{"name":"Embedded Brand"},"price":{"value":2599,"mrp":3999},"images":["https://cdn.example.in/embedded-a.webp","https://cdn.example.in/embedded-b.webp","http://insecure.example.in/c.webp"]}}}}
  </script>
  <meta property="og:title" content="Open Graph Phone" />
  <meta property="og:description" content="A valid product description from metadata." />
  <meta property="product:price:amount" content="2999" />
  <meta property="og:image" content="https://cdn.example.in/og.webp" />
  <meta property="og:image" content="https://cdn.example.in/og-more.webp" />
</head></html>`;

test("shared engine fills missing fields by deterministic strategy priority with provenance", async () => {
  const adapter = new GenericStructuredDataAdapter();
  const empty = await adapter.extract({ ...context, htmlFixture: "<html></html>" });
  const result = applyDeterministicFieldFallback(empty, fixture, rawUrl);

  assert.equal(result.identity.title.value, "Fallback Phone");
  assert.equal(result.identity.title.source, "json_ld");
  assert.equal(result.identity.title.evidencePath, "jsonld.Product.name");
  assert.equal(result.identity.brand.value, "Example Brand");
  assert.equal(result.identity.brand.source, "json_ld");
  assert.equal(result.content.description.value, "A valid product description from metadata.");
  assert.equal(result.content.description.source, "open_graph");
  assert.equal(result.pricing.priceRupees.value, 2599);
  assert.equal(result.pricing.priceRupees.source, "embedded_json");
  assert.equal(result.pricing.mrpRupees.value, 3999);
  assert.equal(result.pricing.priceMinor.value, 259900);
  assert.equal(result.media.primaryImageUrl.value, "https://cdn.example.in/a.webp");
  const gallery = result.media.additionalImageUrls.value ?? [];
  assert.equal(gallery.includes("https://cdn.example.in/b.webp"), true);
  assert.equal(gallery.includes("https://cdn.example.in/embedded-a.webp"), true);
  assert.equal(gallery.includes("https://cdn.example.in/embedded-b.webp"), true);
  assert.equal(gallery.includes("https://cdn.example.in/og.webp"), true);
  assert.equal(gallery.some((image) => image.startsWith("http://")), false);
});

test("adapter and authorized values take precedence; restricted fields are never overwritten", async () => {
  const adapter = new GenericStructuredDataAdapter();
  const base = await adapter.extract({ ...context, htmlFixture: "<html></html>" });
  base.identity.title = { value: "Adapter Title", source: "official_api", confidence: "HIGH" };
  base.pricing.priceMinor = restrictedField("Retailer page extraction is not authorized.");
  base.pricing.priceRupees = restrictedField("Retailer page extraction is not authorized.");

  const result = applyDeterministicFieldFallback(base, fixture, rawUrl);
  assert.equal(result.identity.title.value, "Adapter Title");
  assert.equal(result.identity.title.source, "official_api");
  assert.equal(result.pricing.priceMinor.value, null);
  assert.equal(result.pricing.priceMinor.confidence, "RESTRICTED");
  assert.equal(result.pricing.priceRupees.value, null);
  assert.equal(result.pricing.priceRupees.confidence, "RESTRICTED");
});

test("a usable structured value replaces a low-confidence URL-derived placeholder", async () => {
  const adapter = new GenericStructuredDataAdapter();
  const base = await adapter.extract(context);
  assert.equal(base.identity.title.value, null);

  const result = applyDeterministicFieldFallback(base, fixture, rawUrl);
  assert.equal(result.identity.title.value, "Fallback Phone");
  assert.equal(result.identity.title.confidence, "HIGH");
});

test("deterministic fallback leaves MRP missing when the page only provides a selling price", async () => {
  const adapter = new GenericStructuredDataAdapter();
  const empty = await adapter.extract({ ...context, htmlFixture: "<html></html>" });
  const html = '<script type="application/ld+json">{"@type":"Product","name":"Example item","offers":{"@type":"Offer","price":"1499","priceCurrency":"INR"}}</script>';

  const result = applyDeterministicFieldFallback(empty, html, rawUrl);
  assert.equal(result.pricing.priceRupees.value, 1499);
  assert.equal(result.pricing.mrpRupees.value, null);
  assert.equal(result.pricing.mrpMinor.value, null);
});

test("deterministic brand inference from product title is marked medium-confidence heuristic", async () => {
  const adapter = new GenericStructuredDataAdapter();
  const inferred = await adapter.extract({
    ...context,
    htmlFixture: '<script type="application/ld+json">{"@type":"Product","name":"Nike Air Max Running Shoes"}</script>',
  });
  assert.equal(inferred.identity.brand.value, "Nike");
  assert.equal(inferred.identity.brand.source, "url_heuristic");
  assert.equal(inferred.identity.brand.confidence, "MEDIUM");
});
