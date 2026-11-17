import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { getDatabase } from "@/server/db/client";
import { canCreateDealsDirectly, canReviewSubmissions } from "@/server/auth/permissions";
import { DealError, saveDeal } from "@/server/deals/service";
import { publicUrl } from "@/features/deals/validation";
import { readImage } from "@/server/storage/media";
import type { AdminRole } from "@/server/auth/permissions";

type Db = ReturnType<typeof getDatabase>;
export type ReviewActor = { id: string; role: AdminRole };

const assertCanReview = (actor: ReviewActor) => {
  if (!canReviewSubmissions(actor.role)) throw new DealError("Permission denied.", 403);
};

const listSelect = {
  id: true, status: true, title: true, brand: true, description: true, productUrl: true, merchantName: true, categoryHint: true,
  priceMinor: true, mrpMinor: true, couponCode: true, version: true, resubmissions: true, submittedAt: true, reviewedAt: true, rejectionReason: true, dealId: true,
  customer: { select: { id: true, name: true, email: true, forumProfile: { select: { handle: true } } } },
  deal: { select: { status: true, everPublished: true } },
} as const;

export async function listSubmissions(actor: ReviewActor, status: "PENDING_REVIEW" | "APPROVED" | "REJECTED", page = 1) {
  assertCanReview(actor);
  const take = 25;
  const db = getDatabase();
  const [items, total, pending] = await Promise.all([
    db.communityDealSubmission.findMany({ where: { status }, orderBy: { submittedAt: "asc" }, skip: (page - 1) * take, take, select: listSelect }),
    db.communityDealSubmission.count({ where: { status } }),
    db.communityDealSubmission.count({ where: { status: "PENDING_REVIEW" } }),
  ]);
  return {
    total, page, pending,
    // Moderators see the member's public user name only, never their real name or email (administrators and editors keep what they had).
    items: items.map(({ customer, ...row }) => ({ ...row, customer: canCreateDealsDirectly(actor.role) ? { id: customer.id, name: customer.name, email: customer.email } : { id: customer.id, name: customer.forumProfile?.handle ?? "member", email: "" }, submittedAt: row.submittedAt.toISOString(), reviewedAt: row.reviewedAt?.toISOString() ?? null, imageUrl: `${actor.role === "COMMUNITY_MODERATOR" ? "/api/v1/moderator" : "/api/v1/admin"}/submissions/${row.id}/image` })),
  };
}

/** Admin bell: deals members have submitted that still wait for a decision. Roles that cannot review get an empty list. */
export async function getAdminNotifications(actor: ReviewActor) {
  if (!canReviewSubmissions(actor.role)) return { pendingSubmissions: 0, items: [] as { id: string; title: string; submittedAt: string; resubmitted: boolean }[] };
  const db = getDatabase();
  const where = { status: "PENDING_REVIEW" as const };
  const [pendingSubmissions, rows] = await Promise.all([
    db.communityDealSubmission.count({ where }),
    db.communityDealSubmission.findMany({ where, orderBy: { submittedAt: "desc" }, take: 8, select: { id: true, title: true, submittedAt: true, resubmissions: true } }),
  ]);
  return { pendingSubmissions, items: rows.map((r) => ({ id: r.id, title: r.title, submittedAt: r.submittedAt.toISOString(), resubmitted: r.resubmissions > 0 })) };
}

export async function getSubmissionImage(actor: ReviewActor, id: string) {
  assertCanReview(actor);
  const row = await getDatabase().communityDealSubmission.findUnique({ where: { id }, select: { imageKey: true, imageProvider: true, imageMime: true } });
  if (!row) throw new DealError("Submission not found.", 404);
  return { bytes: await readImage(row.imageProvider, row.imageKey), mimeType: row.imageMime };
}

export const approveSchema = z.object({
  version: z.number().int().positive(),
  categoryId: z.string().min(1).max(100),
  merchantId: z.string().min(1).max(100),
  title: z.string().trim().min(3).max(200),
  brand: z.string().trim().max(100),
  description: z.string().trim().min(1).max(2000),
  productUrl: publicUrl,
  priceMinor: z.number().int().min(0).max(2_000_000_000),
  mrpMinor: z.number().int().min(1).max(2_000_000_000),
  couponCode: z.string().trim().max(50).nullable().optional(),
}).strict();

const slugFor = (title: string) =>
  `${title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "deal"}-${randomBytes(3).toString("hex")}`;

/**
 * Approval creates an ordinary DRAFT deal through the existing saveDeal rules (category, merchant, image, price checks).
 * Publishing still goes through the existing preview + publish step, so nothing becomes public here.
 */
export async function approveSubmission(actor: ReviewActor, id: string, raw: unknown) {
  assertCanReview(actor);
  const input = approveSchema.parse(raw);
  const db = getDatabase();
  return db.$transaction(async (tx) => {
    const submission = await tx.communityDealSubmission.findUnique({ where: { id } });
    if (!submission) throw new DealError("Submission not found.", 404);
    if (submission.status !== "PENDING_REVIEW") throw new DealError("Only a submission awaiting review can be approved.", 409);
    if (submission.version !== input.version) throw new DealError("This submission changed. Reload first.", 409);

    const media = await tx.media.create({
      data: {
        storageKey: submission.imageKey, provider: submission.imageProvider, mimeType: submission.imageMime, byteSize: submission.imageBytes,
        width: submission.imageWidth, height: submission.imageHeight, alt: input.title.slice(0, 240), uploadedById: actor.id,
      },
    });
    const deal = await saveDeal(tx, actor, {
      slug: slugFor(input.title), title: input.title, brand: input.brand, description: input.description, categoryId: input.categoryId, merchantId: input.merchantId,
      mediaId: media.id, mrpMinor: input.mrpMinor, priceMinor: input.priceMinor, currency: "INR", rating: null, reviewCount: null, ratingSource: null,
      productUrl: input.productUrl, affiliateUrl: null, couponCode: input.couponCode || null, status: "DRAFT", publishedAt: null, startsAt: null, expiresAt: null,
      featured: false, trending: false, options: [],
    }, undefined, undefined, { moderatorDraft: !canCreateDealsDirectly(actor.role) });
    const changed = await tx.communityDealSubmission.updateMany({
      where: { id, version: input.version, status: "PENDING_REVIEW" },
      data: { status: "APPROVED", dealId: deal.id, reviewedById: actor.id, reviewedAt: new Date(), rejectionReason: null, version: { increment: 1 } },
    });
    if (changed.count !== 1) throw new DealError("Another reviewer just handled this submission.", 409);
    await tx.auditEvent.create({ data: { actorId: actor.id, action: "submission.approved", targetId: id, success: true, metadata: { dealId: deal.id, customerId: submission.customerId } } });
    return { submissionId: id, dealId: deal.id };
  });
}

export const rejectSchema = z.object({ version: z.number().int().positive(), reason: z.string().trim().min(5, "Give the customer a short reason.").max(500) }).strict();

export async function rejectSubmission(actor: ReviewActor, id: string, raw: unknown) {
  assertCanReview(actor);
  const input = rejectSchema.parse(raw);
  const db = getDatabase();
  return db.$transaction(async (tx) => {
    const changed = await tx.communityDealSubmission.updateMany({
      where: { id, version: input.version, status: "PENDING_REVIEW" },
      data: { status: "REJECTED", rejectionReason: input.reason, reviewedById: actor.id, reviewedAt: new Date(), version: { increment: 1 } },
    });
    if (changed.count !== 1) {
      const exists = await tx.communityDealSubmission.findUnique({ where: { id }, select: { status: true } });
      throw new DealError(exists ? "This submission was already handled or changed. Reload first." : "Submission not found.", exists ? 409 : 404);
    }
    const row = await tx.communityDealSubmission.findUniqueOrThrow({ where: { id }, select: { customerId: true } });
    await tx.auditEvent.create({ data: { actorId: actor.id, action: "submission.rejected", targetId: id, success: true, metadata: { customerId: row.customerId } } });
    return { submissionId: id };
  });
}

export type { Db };
