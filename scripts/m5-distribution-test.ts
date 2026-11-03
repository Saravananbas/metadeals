import "dotenv/config";
import assert from "node:assert/strict";
import { getDatabase, disconnectDatabase } from "../src/server/db/client";
import {
  createDestination,
  listDestinations,
  publishDealToDestinations,
  getDistributionHistory,
  DistributionError,
} from "../src/server/distribution/service";

async function runDistributionIntegration() {
  const db = getDatabase();
  console.log("Starting M5 Social Distribution integration test...");

  const tag = `test-m5-${Date.now()}`;
  let merchantId = "";
  let categoryId = "";
  let mediaId = "";
  let dealId = "";
  let tgDestId = "";
  let waDestId = "";

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
    }
    const actor = { id: admin.id, role: admin.role as "SUPER_ADMIN" };

    // 1. Create merchant, category, media and published deal
    const merchant = await db.merchant.create({
      data: {
        slug: `merchant-${tag}`,
        name: "Amazon Distribution Test",
        websiteUrl: "https://www.amazon.in",
      },
    });
    merchantId = merchant.id;

    const category = await db.category.create({
      data: {
        slug: `category-${tag}`,
        name: "Audio Test",
      },
    });
    categoryId = category.id;

    const media = await db.media.create({
      data: {
        storageKey: `media-${tag}.webp`,
        provider: "local",
        mimeType: "image/webp",
        byteSize: 1024,
        width: 300,
        height: 300,
        alt: "Audio image",
        uploadedById: admin.id,
      },
    });
    mediaId = media.id;

    const deal = await db.deal.create({
      data: {
        slug: `deal-${tag}`,
        title: "Sony XM5 Broadcast Test",
        brand: "Sony",
        description: "Flagship headphones",
        category: { connect: { id: categoryId } },
        merchant: { connect: { id: merchantId } },
        media: { connect: { id: mediaId } },
        createdBy: { connect: { id: admin.id } },
        updatedBy: { connect: { id: admin.id } },
        mrpMinor: 2999000,
        priceMinor: 2199000,
        currency: "INR",
        productUrl: "https://www.amazon.in/dp/B09XS7JWHH",
        affiliateUrl: "https://www.amazon.in/dp/B09XS7JWHH?tag=metadeals-21",
        status: "PUBLISHED",
        publishedAt: new Date(Date.now() - 10000),
      },
    });
    dealId = deal.id;

    // 2. Create distribution destinations
    const tgDest = await createDestination(db, actor, {
      platform: "TELEGRAM",
      name: `Telegram Channel ${tag}`,
      destinationId: `@channel_${tag}`,
      isActive: true,
    });
    tgDestId = tgDest.id;

    const waDest = await createDestination(db, actor, {
      platform: "WHATSAPP",
      name: `WhatsApp Group ${tag}`,
      destinationId: `wa_group_${tag}`,
      isActive: true,
    });
    waDestId = waDest.id;

    const destinations = await listDestinations(db, actor);
    assert.ok(destinations.some((d) => d.id === tgDestId));
    assert.ok(destinations.some((d) => d.id === waDestId));

    // 3. Publish deal to both channels in mock mode
    const publishRes = await publishDealToDestinations(db, actor, {
      dealId: deal.id,
      destinationIds: [tgDestId, waDestId],
      mockOnly: true,
    });

    assert.equal(publishRes.results.length, 2);
    assert.equal(publishRes.results[0].status, "SENT");
    assert.equal(publishRes.results[1].status, "SENT");
    assert.ok(publishRes.results[0].messageId?.startsWith("mock-tg"));
    assert.ok(publishRes.results[1].messageId?.startsWith("mock-wa"));

    // Check posts in database
    const postCount = await db.distributionPost.count({ where: { dealId } });
    assert.equal(postCount, 2, "Database must record exactly two distribution posts");

    // 4. Test duplicate broadcast prevention: second publish must be SKIPPED
    const duplicateRes = await publishDealToDestinations(db, actor, {
      dealId: deal.id,
      destinationIds: [tgDestId, waDestId],
      mockOnly: true,
    });

    assert.equal(duplicateRes.results.length, 2);
    assert.equal(duplicateRes.results[0].status, "SKIPPED");
    assert.equal(duplicateRes.results[1].status, "SKIPPED");

    const postCountAfter = await db.distributionPost.count({ where: { dealId } });
    assert.equal(postCountAfter, 2, "Duplicate posts must not be inserted");

    // 5. Test draft deal rejection
    await db.deal.update({ where: { id: dealId }, data: { status: "DRAFT" } });
    await assert.rejects(
      publishDealToDestinations(db, actor, { dealId, destinationIds: [tgDestId], mockOnly: true }),
      (err: DistributionError) => err.status === 400,
      "Draft deal must not be allowed to broadcast"
    );

    // 6. Test expired deal rejection
    await db.deal.update({
      where: { id: dealId },
      data: { status: "PUBLISHED", expiresAt: new Date(Date.now() - 1000) },
    });
    await assert.rejects(
      publishDealToDestinations(db, actor, { dealId, destinationIds: [tgDestId], mockOnly: true }),
      (err: DistributionError) => err.status === 410,
      "Expired deal must not be allowed to broadcast"
    );

    // 7. Verify distribution history
    const history = await getDistributionHistory(db, actor, dealId);
    assert.equal(history.length, 2);
    assert.ok(history.every((h) => h.status === "SENT"));

    console.log("PASS M5 Social Distribution: Multi-channel formatting, Telegram/WhatsApp dispatch, idempotency, duplicate prevention, and lifecycle gates.");
  } finally {
    // Cleanup
    await db.distributionPost.deleteMany({ where: { dealId } }).catch(() => {});
    if (tgDestId) await db.distributionDestination.delete({ where: { id: tgDestId } }).catch(() => {});
    if (waDestId) await db.distributionDestination.delete({ where: { id: waDestId } }).catch(() => {});
    await db.deal.deleteMany({ where: { id: dealId } }).catch(() => {});
    await db.media.deleteMany({ where: { id: mediaId } }).catch(() => {});
    await db.merchant.deleteMany({ where: { id: merchantId } }).catch(() => {});
    await db.category.deleteMany({ where: { id: categoryId } }).catch(() => {});
    await disconnectDatabase();
  }
}

void runDistributionIntegration().catch((error) => {
  console.error("M5 Integration Test Failed:", error);
  process.exitCode = 1;
});
