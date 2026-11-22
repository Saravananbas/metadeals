import assert from "node:assert/strict";
import test from "node:test";

process.env.NEXTAUTH_SECRET ??= "test-nextauth-secret-0123456789abcdef0123";
process.env.NEXTAUTH_URL ??= "http://localhost:4123";
process.env.AUTH_SESSION_SECRET ??= "test-session-secret-0123456789abcdef0123";

test("productKey finds the product in Amazon and Flipkart links whatever the tracking text", async () => {
  const { productKey } = await import("../src/server/customer/deal-check");
  assert.equal(productKey("https://www.amazon.in/ASUS-ROG-Strix/dp/B0DZZWMB2L?ref=dlx_black&pf_rd_r=ABC&sr=8-1"), "/B0DZZWMB2L");
  assert.equal(productKey("https://www.amazon.in/gp/product/b0dzzwmb2l/ref=xyz"), "/B0DZZWMB2L");
  assert.equal(productKey("https://www.flipkart.com/samsung-galaxy/p/itm123?pid=MOBGX7ZR8Y9ABCDE&lid=LSTx&marketplace=FLIPKART"), "pid=MOBGX7ZR8Y9ABCDE");
  assert.equal(productKey("https://www.croma.com/some-product/p/12345"), "/some-product/p/12345");
  assert.equal(productKey("https://plumgoodness.com/products/plum-bodylovin-popcorn-n-pilates-glassic-lip-balm-10g?utm_source=fb&variant=1"), "/products/plum-bodylovin-popcorn-n-pilates-glassic-lip-balm-10g");
  assert.equal(productKey("https://www.example.com/"), null, "a home page is not a product");
  assert.equal(productKey("https://www.example.com/search?q=shoes"), null, "a search page is not a product");
  assert.equal(productKey("https://www.example.com/category/mobile-phones"), null, "a category page is not a product");
  assert.equal(productKey("not a link"), null);
});
