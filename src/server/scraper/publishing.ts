import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { recordPriceObservation } from "./price-history";
import { convertMerchantUrl } from "@/server/affiliate/adapters/registry";
import { sendTelegramMessage } from "@/server/distribution/telegram";
import { formatTelegramMessage } from "@/features/distribution/formatting";

export type DatabaseClient = Prisma.TransactionClient;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 100);
}

/**
 * Publishes a verified candidate offer into the canonical Deal table.
 */
export async function publishVerifiedCandidate(
  db: DatabaseClient,
  candidateId: string,
  actorId?: string
) {
  const candidate = await db.dealCandidate.findUnique({
    where: { id: candidateId },
  });

  if (!candidate) {
    throw new Error(`Candidate ${candidateId} not found.`);
  }

  // 1. Resolve Admin Actor
  let adminId = actorId;
  if (!adminId) {
    const admin = await db.user.findFirst({
      where: { role: "SUPER_ADMIN", status: "ACTIVE" },
      select: { id: true },
    });
    if (!admin) {
      throw new Error("No active SUPER_ADMIN user found to attribute deal publishing.");
    }
    adminId = admin.id;
  }

  // 2. Resolve or create Category
  let category = await db.category.findUnique({
    where: { slug: candidate.categorySlug },
  });
  if (!category) {
    category = await db.category.create({
      data: {
        slug: candidate.categorySlug,
        name: candidate.categorySlug.charAt(0).toUpperCase() + candidate.categorySlug.slice(1),
      },
    });
  }

  // 3. Resolve or create Merchant
  const merchantSlug = candidate.sourcePlatform.toLowerCase().replace(/[^\w-]/g, "");
  let merchant = await db.merchant.findUnique({
    where: { slug: merchantSlug },
  });
  if (!merchant) {
    let merchantName = "Retailer";
    let websiteUrl = "https://example.com";
    if (merchantSlug === "amazon") {
      merchantName = "Amazon India";
      websiteUrl = "https://www.amazon.in";
    } else if (merchantSlug === "flipkart") {
      merchantName = "Flipkart";
      websiteUrl = "https://www.flipkart.com";
    } else if (merchantSlug === "cuelinks") {
      merchantName = "Tata CLiQ / Partner";
      websiteUrl = "https://www.tatacliq.com";
    }

    merchant = await db.merchant.create({
      data: {
        slug: merchantSlug,
        name: merchantName,
        websiteUrl,
      },
    });
  }

  // 4. Resolve or create Media
  let media = await db.media.findFirst();
  if (!media) {
    media = await db.media.create({
      data: {
        storageKey: `scraped/${candidate.id}.jpg`,
        provider: "LOCAL",
        mimeType: "image/jpeg",
        byteSize: 10240,
        width: 800,
        height: 600,
        alt: candidate.rawTitle.slice(0, 100),
        uploadedById: adminId,
      },
    });
  }

  // 5. Generate unique slug
  const baseSlug = slugify(candidate.rawTitle);
  let dealSlug = `${baseSlug}-${candidate.externalId ? slugify(candidate.externalId) : candidate.id.slice(-6)}`;
  dealSlug = dealSlug.slice(0, 115);

  const existingSlug = await db.deal.findUnique({ where: { slug: dealSlug } });
  if (existingSlug) {
    dealSlug = `${dealSlug}-${Date.now().toString().slice(-4)}`;
  }

  // 6. Convert affiliate URL
  let affiliateUrl: string | null = null;
  try {
    const urlObj = new URL(candidate.sourceUrl);
    const converted = convertMerchantUrl(candidate.sourceUrl, urlObj.hostname, {
      dealId: dealSlug,
      subId: "scraper",
    });
    if (converted.isAffiliate) {
      affiliateUrl = converted.url;
    }
  } catch {
    // Keep affiliateUrl null if conversion fails
  }

  // 7. Create Deal
  const deal = await db.deal.create({
    data: {
      slug: dealSlug,
      title: candidate.rawTitle,
      brand: candidate.brand || "Brand",
      description: `${candidate.rawTitle}. Verified deal observed at ₹${Math.round(candidate.observedPriceMinor / 100)} from ${candidate.sellerName || merchant.name}.`,
      categoryId: category.id,
      merchantId: merchant.id,
      mediaId: media.id,
      mrpMinor: candidate.observedMrpMinor,
      priceMinor: candidate.observedPriceMinor,
      currency: candidate.currency,
      productUrl: candidate.sourceUrl,
      affiliateUrl,
      status: "PUBLISHED",
      publishedAt: new Date(),
      everPublished: true,
      createdById: adminId,
      updatedById: adminId,
    },
  });

  // 8. Update Candidate
  await db.dealCandidate.update({
    where: { id: candidate.id },
    data: {
      dealId: deal.id,
      status: "PUBLISHED",
      updatedAt: new Date(),
    },
  });

  // 9. Record Price Observation
  await recordPriceObservation(db, {
    merchantSlug: merchant.slug,
    priceMinor: candidate.observedPriceMinor,
    mrpMinor: candidate.observedMrpMinor,
    sourceUrl: candidate.sourceUrl,
    currency: candidate.currency,
    dealId: deal.id,
    candidateId: candidate.id,
  });

  // 10. Social Distribution (if active destinations configured)
  try {
    const telegramDest = await db.distributionDestination.findFirst({
      where: { platform: "TELEGRAM", isActive: true },
    });
    if (telegramDest) {
      const message = formatTelegramMessage({
        id: deal.id,
        slug: deal.slug,
        title: deal.title,
        brand: deal.brand,
        priceMinor: deal.priceMinor,
        mrpMinor: deal.mrpMinor,
        merchantName: merchant.name,
        siteBaseUrl: process.env.NEXTAUTH_URL ?? "http://localhost:4123",
      });

      const post = await db.distributionPost.create({
        data: {
          dealId: deal.id,
          destinationId: telegramDest.id,
          platform: "TELEGRAM",
          status: "QUEUED",
          messageContent: message,
        },
      });

      const result = await sendTelegramMessage(telegramDest.destinationId, message);

      await db.distributionPost.update({
        where: { id: post.id },
        data: {
          status: result.success ? "SENT" : "FAILED",
          externalMessageId: result.externalMessageId,
          errorMessage: result.error,
          sentAt: result.success ? new Date() : null,
        },
      });
    }
  } catch {
    // Non-blocking: social post error must never roll back published deal
  }

  return deal;
}
