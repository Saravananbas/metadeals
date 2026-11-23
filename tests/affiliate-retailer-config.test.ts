import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { convertMerchantUrl } from "../src/server/affiliate/adapters/registry";
import { buildOwnLink, configProblem, decryptCredentials, earningVia, encryptCredentials, type RetailerAffiliateConfig } from "../src/server/affiliate/retailer-config";

const base = { publicId: null, linkTemplate: null } as const;
const own = (c: Partial<RetailerAffiliateConfig>): RetailerAffiliateConfig => ({ mode: "OWN", provider: "amazon", ...base, ...c });

test("own Amazon and Flipkart links carry the tag and the channel", () => {
  const a = buildOwnLink(own({ provider: "amazon", publicId: "metadeals-21" }), "https://www.amazon.in/dp/B0X?ref=1", "telegram");
  assert.equal(a?.isAffiliate, true);
  const au = new URL(a!.url);
  assert.equal(au.searchParams.get("tag"), "metadeals-21");
  assert.equal(au.searchParams.get("ascsubtag"), "telegram");
  const f = buildOwnLink(own({ provider: "flipkart", publicId: "meta123" }), "https://www.flipkart.com/p/itm?pid=1", "web");
  assert.equal(new URL(f!.url).searchParams.get("affid"), "meta123");
});

test("a link template encodes the product link and is trusted only when valid", () => {
  const c = own({ provider: "ajio", linkTemplate: "https://track.example.com/click?id=A1&url={encodedUrl}&sub={subid}" });
  assert.equal(configProblem(c), null);
  const r = buildOwnLink(c, "https://www.ajio.com/p/1?x=a&b=c", "web");
  assert.equal(r?.trusted, true);
  assert.equal(new URL(r!.url).searchParams.get("url"), "https://www.ajio.com/p/1?x=a&b=c");
  for (const bad of ["http://track.example.com/?u={url}", "https://track.example.com/?u=fixed", "https://track.example.com/?u={url}&x={secret}", "https://{url}", "javascript:alert(1)//{url}"]) {
    assert.notEqual(configProblem(own({ provider: "custom", linkTemplate: bad })), null, bad);
    assert.equal(buildOwnLink(own({ provider: "custom", linkTemplate: bad }), "https://www.ajio.com/p/1"), null, bad);
  }
});

test("an incomplete own setting yields no link, so the caller falls back to Cuelinks", () => {
  assert.notEqual(configProblem(own({ provider: "amazon", publicId: null })), null);
  assert.equal(buildOwnLink(own({ provider: "amazon", publicId: "bad tag!" }), "https://www.amazon.in/dp/B0X"), null);
});

test("link selection: own account, switched off, or Cuelinks as before", () => {
  const saved = { id: process.env.CUELINKS_CHANNEL_ID, on: process.env.CUELINKS_ENABLED, mode: process.env.CUELINKS_REDIRECT_MODE };
  process.env.CUELINKS_CHANNEL_ID = "337441"; delete process.env.CUELINKS_ENABLED; delete process.env.CUELINKS_REDIRECT_MODE;
  try {
    const url = "https://www.amazon.in/dp/B0X";
    const ctx = { dealId: "d", subId: "web" };
    assert.equal(convertMerchantUrl(url, "www.amazon.in", ctx).provider, "cuelinks");
    assert.equal(convertMerchantUrl(url, "www.amazon.in", ctx, null).provider, "cuelinks");
    assert.equal(convertMerchantUrl(url, "www.amazon.in", ctx, own({ publicId: "metadeals-21" })).provider, "amazon");
    assert.equal(convertMerchantUrl(url, "www.amazon.in", ctx, own({ mode: "CUELINKS" })).provider, "cuelinks");
    assert.equal(convertMerchantUrl(url, "www.amazon.in", ctx, own({ publicId: null })).provider, "cuelinks");
    const off = convertMerchantUrl(url, "www.amazon.in", ctx, own({ mode: "NONE" }));
    assert.deepEqual([off.isAffiliate, off.url], [false, url]);
  } finally {
    for (const [k, v] of [["CUELINKS_CHANNEL_ID", saved.id], ["CUELINKS_ENABLED", saved.on], ["CUELINKS_REDIRECT_MODE", saved.mode]] as const) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
});

test("earningVia names the program that earns", () => {
  assert.equal(earningVia(null, true), "Cuelinks");
  assert.equal(earningVia(null, false), "Not monetised");
  assert.equal(earningVia(own({ publicId: "t-21" }), true), "Own account (amazon)");
  assert.match(earningVia(own({ publicId: null }), true), /incomplete/);
  assert.equal(earningVia({ ...own({}), mode: "NONE" }, true), "Not monetised");
});

test("stored credentials are encrypted, round-trip, and need the key", () => {
  const key = process.env.AFFILIATE_CREDENTIALS_KEY;
  delete process.env.AFFILIATE_CREDENTIALS_KEY;
  try {
    assert.throws(() => encryptCredentials("secret"), /AFFILIATE_CREDENTIALS_KEY/);
    process.env.AFFILIATE_CREDENTIALS_KEY = randomBytes(32).toString("base64");
    const stored = encryptCredentials("api-key-123");
    assert.ok(!stored.includes("api-key-123"));
    assert.equal(decryptCredentials(stored), "api-key-123");
    assert.throws(() => decryptCredentials(stored.slice(0, -2) + "xx"));
  } finally {
    if (key === undefined) delete process.env.AFFILIATE_CREDENTIALS_KEY; else process.env.AFFILIATE_CREDENTIALS_KEY = key;
  }
});
