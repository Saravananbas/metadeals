import "server-only";
import { roleCan, type AdminRole } from "@/server/auth/permissions";
import type { DealDatabase } from "@/server/deals/repository";
import {
  formatTelegramMessage,
  formatWhatsAppMessage,
  type DestinationInput,
  type PublishDealInput,
} from "@/features/distribution/formatting";
import { sendTelegramMessage } from "./telegram";
import { sendWhatsAppMessage } from "./whatsapp";

export class DistributionError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "DistributionError";
  }
}

export interface DistributionActor {
  id: string;
  role: AdminRole;
}

export async function createDestination(
  db: DealDatabase,
  actor: DistributionActor,
  input: DestinationInput
) {
  if (!roleCan(actor.role, "operations:read") && !roleCan(actor.role, "deal:publish")) {
    throw new DistributionError("Forbidden: insufficient permissions.", 403);
  }

  const destination = await db.distributionDestination.upsert({
    where: {
      platform_destinationId: {
        platform: input.platform,
        destinationId: input.destinationId,
      },
    },
    create: input,
    update: {
      name: input.name,
      isActive: input.isActive,
    },
  });

  return destination;
}

export async function listDestinations(db: DealDatabase, actor: DistributionActor) {
  if (!roleCan(actor.role, "operations:read") && !roleCan(actor.role, "deal:publish")) {
    throw new DistributionError("Forbidden: insufficient permissions.", 403);
  }

  return db.distributionDestination.findMany({
    orderBy: { createdAt: "desc" },
  });
}

export async function publishDealToDestinations(
  db: DealDatabase,
  actor: DistributionActor,
  input: PublishDealInput
) {
  if (!roleCan(actor.role, "deal:publish")) {
    throw new DistributionError("Forbidden: deal:publish permission required.", 403);
  }

  const deal = await db.deal.findUnique({
    where: { id: input.dealId },
    include: { merchant: true },
  });

  if (!deal) {
    throw new DistributionError("Deal not found.", 404);
  }

  const now = new Date();
  if (deal.status !== "PUBLISHED") {
    throw new DistributionError("Only published deals can be broadcast to social channels.", 400);
  }

  if (deal.expiresAt && deal.expiresAt <= now) {
    throw new DistributionError("Cannot publish expired deals.", 410);
  }

  const destinations = await db.distributionDestination.findMany({
    where: {
      id: { in: input.destinationIds },
      isActive: true,
    },
  });

  if (destinations.length === 0) {
    throw new DistributionError("No active destinations found for the given IDs.", 400);
  }

  const results: Array<{
    destinationId: string;
    platform: string;
    status: "QUEUED" | "SENT" | "SKIPPED" | "FAILED";
    messageId?: string;
    error?: string;
  }> = [];

  for (const dest of destinations) {
    const existing = await db.distributionPost.findUnique({
      where: {
        dealId_destinationId: {
          dealId: deal.id,
          destinationId: dest.id,
        },
      },
    });

    if (existing && existing.status === "SENT") {
      results.push({
        destinationId: dest.id,
        platform: dest.platform,
        status: "SKIPPED",
        messageId: existing.externalMessageId || undefined,
      });
      continue;
    }

    const payload = {
      id: deal.id,
      slug: deal.slug,
      title: deal.title,
      brand: deal.brand,
      priceMinor: deal.priceMinor,
      mrpMinor: deal.mrpMinor,
      merchantName: deal.merchant.name,
      siteBaseUrl: process.env.NEXT_PUBLIC_APP_URL,
    };

    let content = "";
    let dispatchRes;

    if (dest.platform === "TELEGRAM") {
      content = formatTelegramMessage(payload);
      dispatchRes = await sendTelegramMessage(dest.destinationId, content, input.mockOnly);
    } else {
      content = formatWhatsAppMessage(payload);
      dispatchRes = await sendWhatsAppMessage(dest.destinationId, content, input.mockOnly);
    }

    const postStatus = dispatchRes.success ? "SENT" : "FAILED";
    const postRecord = await db.distributionPost.upsert({
      where: {
        dealId_destinationId: {
          dealId: deal.id,
          destinationId: dest.id,
        },
      },
      create: {
        dealId: deal.id,
        destinationId: dest.id,
        platform: dest.platform,
        status: postStatus,
        messageContent: content,
        externalMessageId: dispatchRes.externalMessageId || null,
        errorMessage: dispatchRes.error || null,
        sentAt: dispatchRes.success ? new Date() : null,
      },
      update: {
        status: postStatus,
        messageContent: content,
        externalMessageId: dispatchRes.externalMessageId || null,
        errorMessage: dispatchRes.error || null,
        sentAt: dispatchRes.success ? new Date() : null,
      },
    });

    results.push({
      destinationId: dest.id,
      platform: dest.platform,
      status: postRecord.status,
      messageId: postRecord.externalMessageId || undefined,
      error: postRecord.errorMessage || undefined,
    });
  }

  await db.auditEvent.create({
    data: {
      actorId: actor.id,
      action: "deal.distributed",
      targetId: deal.id,
      success: results.some((r) => r.status === "SENT"),
      metadata: {
        dealTitle: deal.title,
        destinationsCount: results.length,
        sentCount: results.filter((r) => r.status === "SENT").length,
        skippedCount: results.filter((r) => r.status === "SKIPPED").length,
        failedCount: results.filter((r) => r.status === "FAILED").length,
      },
    },
  });

  return { results };
}

export async function getDistributionHistory(
  db: DealDatabase,
  actor: DistributionActor,
  dealId?: string
) {
  if (!roleCan(actor.role, "operations:read") && !roleCan(actor.role, "deal:publish")) {
    throw new DistributionError("Forbidden: insufficient permissions.", 403);
  }

  return db.distributionPost.findMany({
    where: dealId ? { dealId } : {},
    include: { destination: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

/**
 * Called after a deal is published. Posts to every active Telegram destination; never throws, so publishing cannot fail because of Telegram.
 * Does nothing without TELEGRAM_BOT_TOKEN (or in mock mode) so no fake "sent" record blocks a later real post.
 */
export async function autoPostToTelegram(db: DealDatabase, actor: DistributionActor, dealId: string) {
  try {
    if (!process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_MOCK === "true") return;
    const destinations = await db.distributionDestination.findMany({ where: { platform: "TELEGRAM", isActive: true }, select: { id: true } });
    if (!destinations.length) return;
    await publishDealToDestinations(db, actor, { dealId, destinationIds: destinations.map((d) => d.id), mockOnly: false });
  } catch (error) {
    console.warn("Telegram auto-post failed:", error instanceof Error ? error.message : "unknown");
  }
}
