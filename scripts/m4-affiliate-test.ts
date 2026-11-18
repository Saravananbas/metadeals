import "dotenv/config";
import assert from "node:assert/strict";
import { getDatabase, disconnectDatabase } from "../src/server/db/client";
import {
  resolveDealRedirect,
  importAffiliateTransactions,
  getAffiliateClickStats,
  getAffiliateTransactions,
  AffiliateError,
} from "../src/server/affiliate/service";

async function runAffiliateIntegration() {
  const db = getDatabase();
  console.log("Starting M4 Affiliate Monetization integration test...");

  // Generate unique tag for test isolation
  const tag = `test-m4-${Date.now()}`;
  let merchantId = "";
  let categoryId = "";
  let mediaId = "";
  let dealId = "";
  let optionId = "";
  let createdUserId = "";

  try {
    let admin = await db.user.findFirst();
    if (!admin) {
      admin = await db.user.create({
        data: {
          email: `admin-${tag}@example.test`,
          name: "Test Admin",
          role: "SUPER_ADMIN",
          status: "ACTIVE",
        },
      });
      createdUserId = admin.id;
    }

    // 1. Create test merchant with allowed affiliate hosts
    const merchant = await db.merchant.create({
      data: {
        slug: `merchant-${tag}`,
        name: "Tata Cliq Test",
        websiteUrl: "https://www.tatacliq.com",
        affiliateHosts: ["tatacliq.com", "linksredirect.com"],
      },
    });
    merchantId = merchant.id;

    // 2. Create test category
    const category = await db.category.create({
      data: {
        slug: `category-${tag}`,
        name: "Electronics Test",
      },
    });
    categoryId = category.id;

    // 3. Create test media
    const media = await db.media.create({
      data: {
        storageKey: `media-${tag}.png`,
        provider: "local",
        mimeType: "image/png",
        byteSize: 1024,
        width: 400,
        height: 400,
        alt: "Test product image",
        uploadedById: admin.id,
      },
    });
    mediaId = media.id;

    // 4. Create active published deal
    const deal = await db.deal.create({
      data: {
        slug: `deal-${tag}`,
        title: "Boat Rockerz 450 Pro Test",
        brand: "boAt",
        description: "Wireless headphones test",
        category: { connect: { id: categoryId } },
        merchant: { connect: { id: merchantId } },
        media: { connect: { id: mediaId } },
        createdBy: { connect: { id: admin.id } },
        updatedBy: { connect: { id: admin.id } },
        mrpMinor: 399900,
        priceMinor: 149900,
        currency: "INR",
        productUrl: "https://www.tatacliq.com/boat-rockerz-450",
        affiliateUrl: "https://linksredirect.com/?pub_id=test&url=https%3A%2F%2Fwww.tatacliq.com%2Fboat-rockerz-450",
        status: "PUBLISHED",
        publishedAt: new Date(Date.now() - 3600000), // 1 hour ago
      },
    });
    dealId = deal.id;

    // Add purchase option
    const option = await db.purchaseOption.create({
      data: {
        deal: { connect: { id: deal.id } },
        merchant: { connect: { id: merchantId } },
        priceMinor: 144900,
        productUrl: "https://www.tatacliq.com/boat-rockerz-450-blue",
        affiliateUrl: "https://linksredirect.com/?pub_id=test&url=https%3A%2F%2Fwww.tatacliq.com%2Fboat-rockerz-450-blue",
      },
    });
    optionId = option.id;

    // 5. Test deal redirect for real browser user
    const realUserRedirect = await resolveDealRedirect(db, deal.slug, null, {
      ip: "203.0.113.195",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36",
      channel: "telegram",
    });

    assert.equal(realUserRedirect.destinationUrl, deal.affiliateUrl);
    assert.equal(realUserRedirect.loggedClick, true);

    const clicksCount = await db.affiliateClick.count({ where: { dealId } });
    assert.equal(clicksCount, 1, "Click must be recorded in database for genuine user");

    // 6. Test bot / crawler redirection: destination resolved without click inflation
    const botRedirect = await resolveDealRedirect(db, deal.id, null, {
      ip: "66.249.66.1",
      userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    });
    assert.equal(botRedirect.destinationUrl, deal.affiliateUrl);
    assert.equal(botRedirect.loggedClick, false);

    const clicksAfterBot = await db.affiliateClick.count({ where: { dealId } });
    assert.equal(clicksAfterBot, 1, "Bot request must not increment click count");

    // 7. Test prefetch header
    const prefetchRedirect = await resolveDealRedirect(db, deal.id, null, {
      ip: "203.0.113.195",
      userAgent: "Mozilla/5.0 Chrome/131.0.0.0",
      prefetch: "prefetch",
    });
    assert.equal(prefetchRedirect.loggedClick, false);
    assert.equal(await db.affiliateClick.count({ where: { dealId } }), 1);

    // 8. Test option redirect
    const optionRedirect = await resolveDealRedirect(db, deal.id, optionId, {
      ip: "203.0.113.50",
      userAgent: "Mozilla/5.0 Safari/605.1.15",
      channel: "whatsapp",
    });
    assert.equal(optionRedirect.destinationUrl, option.affiliateUrl);
    assert.equal(optionRedirect.optionId, optionId);
    assert.equal(await db.affiliateClick.count({ where: { dealId } }), 2);

    // 9. An expired deal still opens the retailer so people can check it for themselves; an archived deal does not.
    await db.deal.update({ where: { id: dealId }, data: { status: "EXPIRED" } });
    const expiredRedirect = await resolveDealRedirect(db, deal.id, null, { ip: "203.0.113.60", userAgent: "Mozilla/5.0 Safari/605.1.15", prefetch: "prefetch" });
    assert.ok(expiredRedirect.destinationUrl, "Expired deal still redirects");
    await db.deal.update({ where: { id: dealId }, data: { status: "ARCHIVED" } });
    await assert.rejects(
      resolveDealRedirect(db, deal.id, null),
      (err: AffiliateError) => err.status === 410,
      "Archived deal must return 410"
    );

    // 10. Test open redirect rejection (untrusted merchant host)
    await db.deal.update({
      where: { id: dealId },
      data: {
        status: "PUBLISHED",
        affiliateUrl: "https://untrusted-phishing.example.com/login",
      },
    });
    await assert.rejects(
      resolveDealRedirect(db, deal.id, null),
      (err: AffiliateError) => err.status === 400 && err.message.includes("Untrusted"),
      "Untrusted domain must be rejected with 400"
    );

    // 11. Test transaction import
    const actor = { id: admin.id, role: "ADMIN" as const };
    const batch = {
      provider: "cuelinks",
      transactions: [
        {
          externalId: `TX-1-${tag}`,
          dealId,
          status: "PENDING" as const,
          commissionMinor: 7500, // INR 75.00
          currency: "INR" as const,
          reportedAt: new Date().toISOString(),
        },
        {
          externalId: `TX-2-${tag}`,
          dealId,
          status: "APPROVED" as const,
          commissionMinor: 15000, // INR 150.00
          currency: "INR" as const,
          reportedAt: new Date().toISOString(),
        },
      ],
    };

    const importRes = await importAffiliateTransactions(db, actor, batch);
    assert.equal(importRes.imported, 2);
    assert.equal(importRes.updated, 0);

    // Check transactions in database
    const stats = await getAffiliateTransactions(db, actor, { provider: "cuelinks" });
    assert.ok(stats.transactions.some((t) => t.externalId === `TX-1-${tag}`));
    assert.ok(stats.transactions.some((t) => t.externalId === `TX-2-${tag}`));
    assert.ok(stats.totalCommissionMinor >= 22500);

    // 12. Test idempotent re-import (update status from PENDING to APPROVED)
    const updatedBatch = {
      provider: "cuelinks",
      transactions: [
        {
          externalId: `TX-1-${tag}`,
          dealId,
          status: "APPROVED" as const,
          commissionMinor: 8000, // Adjusted commission
          currency: "INR" as const,
          reportedAt: new Date().toISOString(),
        },
      ],
    };

    const reimportRes = await importAffiliateTransactions(db, actor, updatedBatch);
    assert.equal(reimportRes.imported, 0);
    assert.equal(reimportRes.updated, 1, "Existing transaction must be updated idempotently");

    const updatedTx = await db.affiliateTransaction.findUnique({
      where: { provider_externalId: { provider: "cuelinks", externalId: `TX-1-${tag}` } },
    });
    assert.equal(updatedTx?.status, "APPROVED");
    assert.equal(updatedTx?.commissionMinor, 8000);

    // 13. Test click reporting
    const clickStats = await getAffiliateClickStats(db, actor, { dealId });
    assert.equal(clickStats.totalClicks, 2);
    assert.equal(clickStats.recentClicks.length, 2);

    console.log("PASS M4 Affiliate Monetization Engine: Open redirect prevention, bot/prefetch filtering, click logging, idempotent transaction imports, and reporting.");
  } finally {
    // Cleanup test records
    await db.affiliateClick.deleteMany({ where: { dealId } }).catch(() => {});
    await db.affiliateTransaction.deleteMany({ where: { provider: "cuelinks", externalId: { contains: tag } } }).catch(() => {});
    await db.purchaseOption.deleteMany({ where: { dealId } }).catch(() => {});
    await db.deal.deleteMany({ where: { id: dealId } }).catch(() => {});
    await db.media.deleteMany({ where: { id: mediaId } }).catch(() => {});
    await db.merchant.deleteMany({ where: { id: merchantId } }).catch(() => {});
    await db.category.deleteMany({ where: { id: categoryId } }).catch(() => {});
    if (createdUserId) await db.user.delete({ where: { id: createdUserId } }).catch(() => {});
    await disconnectDatabase();
  }
}

void runAffiliateIntegration().catch((error) => {
  console.error("M4 Integration Test Failed:", error);
  process.exitCode = 1;
});
