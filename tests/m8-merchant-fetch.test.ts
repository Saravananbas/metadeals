import assert from "node:assert/strict";
import test from "node:test";
import type { IncomingMessage } from "node:http";
import type { PrismaClient } from "../src/generated/prisma/client";
import { findActiveDirectoryMerchantForUrl } from "../src/server/product-extraction/core/merchant-directory-match";
import { validateProductUrl } from "../src/server/product-extraction/security/url-validator";
import {
  fetchPublicResponseBytes,
  matchesAllowedDomain,
  resolvePublicFetchRedirect,
  validatePublicFetchTarget,
  type PublicAddress,
} from "../src/server/product-extraction/security/safe-image-fetch";

type DirectoryRow = {
  id: string;
  name: string;
  domain: string;
  websiteUrl: string;
  status: "ACTIVE" | "INACTIVE";
};

function directoryDb(rows: DirectoryRow[]) {
  return {
    merchantWebsiteDirectory: {
      findMany: async (args: { where: { status: string; domain: { in: string[] } } }) =>
        rows
          .filter((row) => row.status === args.where.status && args.where.domain.in.includes(row.domain))
          .map(({ id, name, domain, websiteUrl }) => ({ id, name, domain, websiteUrl })),
    },
  } as unknown as PrismaClient;
}

function fakeResponse(statusCode: number, location?: string, body = "<html>ok</html>") {
  const response = {
    statusCode,
    headers: {
      "content-type": "text/html; charset=utf-8",
      ...(location ? { location } : {}),
    },
    resume() {},
    destroy() {},
    setTimeout() {},
    async *[Symbol.asyncIterator]() {
      if (body) yield Buffer.from(body);
    },
  };
  return response as unknown as IncomingMessage;
}

test("active Bata directory record resolves www and subdomain URLs", async () => {
  const db = directoryDb([{
    id: "bata-directory-id",
    name: "Bata India",
    domain: "bata.com",
    websiteUrl: "https://www.bata.com",
    status: "ACTIVE",
  }]);

  const match = await findActiveDirectoryMerchantForUrl(db, "https://www.bata.com/in/floatz-sandals.html");
  assert.deepEqual(match, {
    id: "bata-directory-id",
    name: "Bata India",
    domain: "bata.com",
    websiteUrl: "https://www.bata.com",
  });
  assert.deepEqual(await findActiveDirectoryMerchantForUrl(db, "https://shop.bata.com/p/shoe"), match);
});

test("inactive, unknown, deceptive-suffix and insecure Bata URLs do not resolve", async () => {
  const db = directoryDb([
    { id: "inactive", name: "Bata India", domain: "bata.com", websiteUrl: "https://www.bata.com", status: "INACTIVE" },
    { id: "active", name: "Bata India", domain: "bata.com", websiteUrl: "https://www.bata.com", status: "ACTIVE" },
  ]);

  assert.equal(await findActiveDirectoryMerchantForUrl(db, "https://www.bata.com.evil.test/p/shoe"), null);
  assert.equal(await findActiveDirectoryMerchantForUrl(db, "https://notbata.com/p/shoe"), null);
  assert.equal(await findActiveDirectoryMerchantForUrl(db, "http://www.bata.com/p/shoe"), null);
  assert.equal(await findActiveDirectoryMerchantForUrl(db, "https://user:pass@www.bata.com/p/shoe"), null);
  assert.equal(await findActiveDirectoryMerchantForUrl(db, "https://www.bata.com:8443/p/shoe"), null);
});

test("product URL validation accepts only the matched merchant host boundary", () => {
  const bata = { name: "Bata India", domain: "bata.com" };
  assert.equal(validateProductUrl("https://www.bata.com/p/shoe", bata).valid, true);
  assert.equal(validateProductUrl("https://shop.bata.com/p/shoe", bata).valid, true);
  assert.equal(validateProductUrl("https://bata.com.evil.test/p/shoe", bata).valid, false);
  assert.equal(validateProductUrl("https://notbata.com/p/shoe", bata).valid, false);
  assert.equal(validateProductUrl("https://example.com/p/shoe", { name: "Bad", domain: "com" }).valid, false);
});

test("approved domain checks use label boundaries and reject unsafe redirect targets", () => {
  assert.equal(matchesAllowedDomain("www.bata.com", ["bata.com"]), true);
  assert.equal(matchesAllowedDomain("bata.com.evil.test", ["bata.com"]), false);
  assert.equal(validatePublicFetchTarget("https://www.bata.com/item", ["bata.com"]).hostname, "www.bata.com");
  assert.throws(() => validatePublicFetchTarget("http://www.bata.com/item", ["bata.com"]), /HTTPS/);
  assert.throws(() => validatePublicFetchTarget("https://user:pass@www.bata.com/item", ["bata.com"]), /credentials/);
  assert.throws(() => validatePublicFetchTarget("https://www.bata.com:8443/item", ["bata.com"]), /custom port/);
  assert.throws(() => resolvePublicFetchRedirect(new URL("https://www.bata.com/item"), "https://bata.com.evil.test/item", ["bata.com"]), /approved merchant domains/);
  assert.throws(() => resolvePublicFetchRedirect(new URL("https://www.bata.com/item"), "http://www.bata.com/item", ["bata.com"]), /HTTPS/);
});

test("safe fetch pins each approved redirect hop and rejects a redirect to a private address", async () => {
  const resolvedHosts: string[] = [];
  const requestedHosts: string[] = [];
  const firstHopAddress: PublicAddress = { address: "93.184.216.34", family: 4 };
  let responseCount = 0;

  const result = await fetchPublicResponseBytes("https://shop.bata.com/product", 1024, {
    allowedDomains: ["bata.com"],
    contentTypePattern: /^text\/html$/i,
  }, {
    resolvePublicHost: async (hostname) => {
      resolvedHosts.push(hostname);
      return firstHopAddress;
    },
    requestPublicResponse: async (url, pinnedAddress) => {
      requestedHosts.push(url.hostname);
      assert.deepEqual(pinnedAddress, firstHopAddress);
      responseCount += 1;
      return responseCount === 1
        ? fakeResponse(302, "https://www.bata.com/final")
        : fakeResponse(200);
    },
  });

  assert.equal(result.finalUrl, "https://www.bata.com/final");
  assert.deepEqual(resolvedHosts, ["shop.bata.com", "www.bata.com"]);
  assert.deepEqual(requestedHosts, ["shop.bata.com", "www.bata.com"]);

  const privateRedirectResolutions: string[] = [];
  let privateRedirectRequests = 0;
  await assert.rejects(fetchPublicResponseBytes("https://shop.bata.com/product", 1024, {
    allowedDomains: ["bata.com", "169.254.169.254"],
    contentTypePattern: /^text\/html$/i,
  }, {
    resolvePublicHost: async (hostname) => {
      privateRedirectResolutions.push(hostname);
      if (hostname === "169.254.169.254") throw new Error("private or metadata address blocked");
      return firstHopAddress;
    },
    requestPublicResponse: async () => {
      privateRedirectRequests += 1;
      return fakeResponse(302, "https://169.254.169.254/latest/meta-data");
    },
  }), /private or metadata address blocked/);
  assert.deepEqual(privateRedirectResolutions, ["shop.bata.com", "169.254.169.254"]);
  assert.equal(privateRedirectRequests, 1);
});

test("safe fetch rejects private IPv4 and IPv6 literals before making a request", async () => {
  for (const target of [
    "https://127.0.0.1/",
    "https://10.0.0.1/",
    "https://169.254.169.254/latest/meta-data",
    "https://[::1]/",
    "https://[fc00::1]/",
    "https://[::ffff:7f00:1]/",
  ]) {
    await assert.rejects(fetchPublicResponseBytes(target, 1024), /non-public address/i, target);
  }
});
