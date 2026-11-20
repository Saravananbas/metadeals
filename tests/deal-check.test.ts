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
  assert.equal(productKey("https://www.croma.com/some-product/p/12345"), null);
  assert.equal(productKey("not a link"), null);
});
