import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getDatabase, disconnectDatabase } from "../src/server/db/client";
import { createTotpSecret, encryptTotpSecret, hashPassword, createRecoveryCodes, hashRecoveryCode } from "../src/server/auth/crypto";
import { getAuthEnv } from "../src/config/env";
import sharp from "sharp";

async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  if (process.env.NODE_ENV === "production" || url.hostname !== "127.0.0.1" || url.port !== "55432") throw new Error("Local test database only.");
  const db = getDatabase(); const key = randomUUID(); const env = getAuthEnv();
  const password = `Test-${randomUUID()}-aA7!`; const recovery = createRecoveryCodes(1)[0];
  const user = await db.user.create({ data: { email: `m3-http-${key}@invalid.example`, passwordHash: await hashPassword(password), role: "ADMIN", status: "ACTIVE", totpEnabledAt: new Date(), totpSecretEncrypted: encryptTotpSecret(createTotpSecret(), env.AUTH_TOTP_ENCRYPTION_KEY), recoveryCodes: { create: { codeHash: hashRecoveryCode(recovery, env.AUTH_SESSION_SECRET) } } } });
  const base = "http://localhost:4123"; let cookie = ""; const targets: string[] = [];
  async function call(path: string, method = "GET", body?: unknown, status = 200) {
    const result = await fetch(base + path, { method, headers: { Origin: base, Cookie: cookie, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.equal(result.status, status, `${method} ${path}: ${await result.clone().text()}`);
    return result;
  }
  try {
    const login = await call("/api/auth/login", "POST", { email: user.email, password, mfaCode: recovery });
    cookie = login.headers.get("set-cookie")!.split(";")[0]; assert.ok(cookie.includes("metadeals-session="));
    const admin = await call("/admin/deals"); assert.match(await admin.text(), /Deal management/);
    const category = (await (await call("/api/v1/admin/categories", "POST", { name: "HTTP test", slug: `http-${key}`, parentId: null })).json()).data; targets.push(category.id);
    const merchant = (await (await call("/api/v1/admin/merchants", "POST", { name: "HTTP merchant", slug: `http-${key}`, websiteUrl: "https://www.amazon.in/" })).json()).data; targets.push(merchant.id);
    const image = await sharp({ create: { width: 40, height: 40, channels: 3, background: "white" } }).png().toBuffer();
    const upload = await fetch(base + "/api/v1/admin/media?alt=HTTP%20test", { method: "POST", headers: { Origin: base, Cookie: cookie, "Content-Type": "image/png" }, body: image });
    assert.equal(upload.status, 201); const media = (await upload.json()).data; targets.push(media.id);
    const input = { slug: `http-${key}`, title: "HTTP integration test", description: "Temporary validation fixture", brand: "Test", categoryId: category.id, merchantId: merchant.id, mediaId: media.id, mrpMinor: 10000, priceMinor: 9000, currency: "INR", rating: null, reviewCount: null, ratingSource: null, productUrl: "https://www.amazon.in/product", affiliateUrl: null, status: "DRAFT", publishedAt: null, startsAt: null, expiresAt: null, featured: true, trending: false, options: [] };
    let deal = (await (await call("/api/v1/admin/deals", "POST", { deal: input }, 201)).json()).data; targets.push(deal.id);
    await call(`/api/v1/deals/${deal.slug}`, "GET", undefined, 404);
    const invalidOrigin = await fetch(base + `/api/v1/admin/deals/${deal.id}/publish`, { method: "POST", headers: { Origin: "https://attacker.invalid", Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ version: deal.version }) }); assert.equal(invalidOrigin.status, 403);
    await call(`/api/v1/admin/deals/${deal.id}/publish`, "POST", { version: deal.version }, 409);
    const preview = await (await call(`/api/v1/admin/deals/${deal.id}/preview`, "POST", {})).json();
    deal = (await (await call(`/api/v1/admin/deals/${deal.id}/publish`, "POST", { version: deal.version, previewToken: preview.previewToken })).json()).data;
    await call(`/api/v1/deals/${deal.slug}`); const detail = await call(`/deal/${deal.slug}`); assert.match(await detail.text(), /HTTP integration test/);
    const publicImage = await fetch(base + media.url); assert.equal(publicImage.status, 200); assert.equal(publicImage.headers.get("content-type"), "image/webp");
    await call(`/api/v1/admin/deals/${deal.id}`, "DELETE", { version: deal.version }, 409);
    await call(`/api/v1/admin/deals/${deal.id}/archive`, "POST", { version: deal.version });
    await call(`/api/v1/deals/${deal.slug}`, "GET", undefined, 404);
    console.log("PASS M3 authenticated HTTP: real MFA recovery login, protected admin, taxonomy, image upload, draft visibility, CSRF denial, preview/publish, public detail/image, delete protection and archive.");
  } finally {
    // Only this test's unique records; real records are never selected.
    await db.$transaction(async tx => {
      await tx.deal.deleteMany({ where: { createdById: user.id } });
      await tx.media.deleteMany({ where: { uploadedById: user.id } });
      await tx.category.deleteMany({ where: { slug: `http-${key}` } });
      await tx.merchant.deleteMany({ where: { slug: `http-${key}` } });
      await tx.auditEvent.deleteMany({ where: { OR: [{ actorId: user.id }, { targetId: { in: [...targets, user.id] } }] } });
      await tx.user.delete({ where: { id: user.id } });
    });
    await disconnectDatabase();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
