import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getDatabase, disconnectDatabase } from "../src/server/db/client";
import { createTotpSecret, encryptTotpSecret, hashPassword, createRecoveryCodes, hashRecoveryCode } from "../src/server/auth/crypto";
import { getAuthEnv } from "../src/config/env";
import sharp from "sharp";
import type { ClientExtractionResult } from "../src/features/deals/extraction-types";

export interface ApiResponse {
  data?: ClientExtractionResult & { id: string; version: number };
  error?: { code: string; message: string };
}

async function main() {
  console.log("=== Starting Section 13 Browser Verification Tests ===");
  const base = "http://localhost:4123";
  const db = getDatabase();
  const key = randomUUID();
  const env = getAuthEnv();

  // Create temporary authenticated admin user
  const password = `Admin-${randomUUID()}-aA7!`;
  const recovery = createRecoveryCodes(1)[0];
  const user = await db.user.create({
    data: {
      email: `admin-extraction-${key}@invalid.example`,
      passwordHash: await hashPassword(password),
      role: "ADMIN",
      status: "ACTIVE",
      totpEnabledAt: new Date(),
      totpSecretEncrypted: encryptTotpSecret(createTotpSecret(), env.AUTH_TOTP_ENCRYPTION_KEY),
      recoveryCodes: {
        create: { codeHash: hashRecoveryCode(recovery, env.AUTH_SESSION_SECRET) },
      },
    },
  });

  let cookie = "";
  const targets: string[] = [];

  async function call(path: string, method = "GET", body?: unknown, expectedStatus = 200) {
    const res = await fetch(base + path, {
      method,
      headers: {
        Origin: base,
        Cookie: cookie,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {}
    assert.equal(
      res.status,
      expectedStatus,
      `${method} ${path} returned status ${res.status} (expected ${expectedStatus}): ${text}`
    );
    return { res, json, text };
  }

  try {
    // Step 1: Open Admin & Authenticate
    console.log("Step 1: Authenticating as Administrator...");
    const login = await call("/api/auth/login", "POST", { email: user.email, password, mfaCode: recovery });
    cookie = login.res.headers.get("set-cookie")!.split(";")[0];
    assert.ok(cookie.includes("metadeals-session="));

    const adminPage = await call("/admin/deals");
    assert.match(adminPage.text, /Original product URL/i);
    assert.match(adminPage.text, /Scrape/i);
    console.log("✓ Admin Deals page loaded with Original product URL and Scrape button");

    // Step 2 & 3: Paste Amazon sample URL & click Scrape
    console.log("Step 2-5: Testing Amazon India URL extraction...");
    const amazonUrl = "https://www.amazon.in/gp/product/B0CWVFGGQM";
    const amazonRes = await call("/api/v1/admin/product-extraction", "POST", { url: amazonUrl });
    assert.equal(amazonRes.json.data.retailer, "Amazon India");
    assert.equal(amazonRes.json.data.data.identity.asin.value, "B0CWVFGGQM");
    assert.ok(["SUCCESS", "PARTIAL_SUCCESS"].includes(amazonRes.json.data.status));
    assert.ok(["HIGH", "MEDIUM", "RESTRICTED"].includes(amazonRes.json.data.data.pricing.priceMinor.confidence));
    assert.ok(amazonRes.json.data.diagnostics.warnings.length > 0);
    console.log(`✓ Amazon India detected. ASIN: ${amazonRes.json.data.data.identity.asin.value}. Restriction notice confirmed.`);

    // Step 6: Repeat for Flipkart sample URL
    console.log("Step 6: Testing Flipkart URL extraction...");
    const flipkartUrl = "https://www.flipkart.com/samsung-galaxy-s25-fe-5g-jetblack-128-gb/p/itm90e887b150eea?pid=MOBHQCH6FPTX5FZ2&lid=LSTMOBHQCH6FPTX5FZ26HBEZT";
    const flipkartRes = await call("/api/v1/admin/product-extraction", "POST", { url: flipkartUrl });
    assert.equal(flipkartRes.json.data.retailer, "Flipkart");
    assert.equal(flipkartRes.json.data.data.identity.flipkartPid.value, "MOBHQCH6FPTX5FZ2");
    assert.equal(flipkartRes.json.data.data.identity.brand.value, "Samsung");
    assert.equal(flipkartRes.json.data.data.identity.colour.value, "Jetblack");
    assert.equal(flipkartRes.json.data.data.identity.storageRam.value, "128 GB");
    assert.equal(flipkartRes.json.data.matchedTaxonomy?.merchantName, "Flipkart");
    assert.equal(flipkartRes.json.data.matchedTaxonomy?.categoryName, "Mobiles & Tablets");
    console.log(`✓ Flipkart detected. PID: ${flipkartRes.json.data.data.identity.flipkartPid.value}, Brand: ${flipkartRes.json.data.data.identity.brand.value}`);

    // Step 7: Repeat for Myntra sample URL
    console.log("Step 7: Testing Myntra URL extraction...");
    const myntraUrl = "https://www.myntra.com/kurtas/house+pataudi/house-of-pataudi-embellished-mandarin-collar-ethnic-wear-kurta/31647768/buy";
    const myntraRes = await call("/api/v1/admin/product-extraction", "POST", { url: myntraUrl });
    assert.equal(myntraRes.json.data.retailer, "Myntra");
    assert.equal(myntraRes.json.data.data.identity.sku.value, "31647768");
    assert.equal(myntraRes.json.data.data.identity.brand.value, "House of Pataudi");
    assert.equal(myntraRes.json.data.matchedTaxonomy?.merchantName, "Myntra");
    console.log(`✓ Myntra detected. Style ID: ${myntraRes.json.data.data.identity.sku.value}, Brand: ${myntraRes.json.data.data.identity.brand.value}`);

    // Step 8: Test an unknown retailer URL
    console.log("Step 8: Testing unknown retailer URL...");
    await call("/api/v1/admin/product-extraction", "POST", { url: "https://www.unauthorized-random-merchant.com/item/1" }, 400);
    console.log("✓ Unknown retailer domain correctly rejected.");

    // Step 9: Test a malformed URL
    console.log("Step 9: Testing malformed URL...");
    await call("/api/v1/admin/product-extraction", "POST", { url: "not-a-valid-url" }, 400);
    console.log("✓ Malformed URL correctly rejected.");

    // Step 10 & 11: Create a test deal using extracted Flipkart fields and save as DRAFT
    console.log("Step 10-12: Auto-populating deal form, setting prices, and saving as DRAFT...");
    const image = await sharp({ create: { width: 60, height: 60, channels: 3, background: "blue" } }).png().toBuffer();
    const upload = await fetch(base + "/api/v1/admin/media?alt=Flipkart%20Product", {
      method: "POST",
      headers: { Origin: base, Cookie: cookie, "Content-Type": "image/png" },
      body: image,
    });
    assert.equal(upload.status, 201);
    const media = (await upload.json()).data;
    targets.push(media.id);

    const suggested = flipkartRes.json.data.suggestedFormValues;
    const draftDealInput = {
      slug: `verify-extraction-${key.slice(0, 8)}`,
      title: suggested.title,
      brand: suggested.brand,
      description: suggested.description,
      categoryId: suggested.categoryId,
      merchantId: suggested.merchantId,
      mediaId: media.id,
      mrpMinor: 7999900, // ₹79,999.00 in integer paise
      priceMinor: 6499900, // ₹64,999.00 in integer paise
      currency: "INR",
      rating: null,
      reviewCount: null,
      ratingSource: null,
      productUrl: suggested.productUrl,
      affiliateUrl: null,
      status: "DRAFT", // Saving strictly as DRAFT - do NOT publish
      publishedAt: null,
      startsAt: null,
      expiresAt: null,
      featured: false,
      trending: false,
      options: [],
    };

    const saveRes = await call("/api/v1/admin/deals", "POST", { deal: draftDealInput }, 201);
    const savedDeal = saveRes.json.data;
    targets.push(savedDeal.id);

    // Verify saved deal in database
    const dbDeal = await db.deal.findUnique({ where: { id: savedDeal.id } });
    assert.ok(dbDeal);
    assert.equal(dbDeal.status, "DRAFT");
    assert.equal(dbDeal.mrpMinor, 7999900);
    assert.equal(dbDeal.priceMinor, 6499900);
    assert.equal(dbDeal.brand, "Samsung");
    assert.equal(dbDeal.slug, draftDealInput.slug);
    console.log(`✓ Draft deal successfully persisted with MRP: ₹79,999.00 (${dbDeal.mrpMinor} paise) and Deal Price: ₹64,999.00 (${dbDeal.priceMinor} paise). Status: ${dbDeal.status}`);

    console.log("=== All Browser Verification Steps Completed Successfully! ===");
  } finally {
    // Clean up test records
    await db.$transaction(async (tx) => {
      await tx.deal.deleteMany({ where: { createdById: user.id } });
      await tx.media.deleteMany({ where: { uploadedById: user.id } });
      await tx.auditEvent.deleteMany({ where: { actorId: user.id } });
      await tx.productExtractionLog.deleteMany({ where: { adminUserId: user.id } });
      await tx.user.delete({ where: { id: user.id } });
    });
    await disconnectDatabase();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
