import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/server/db/client";
import { normalizeImage, removeStoredImage, readImage, storeImage } from "@/server/storage/media";
import { resubmitSchema, submissionSchema, type SubmissionInput } from "@/features/customer/profile-validation";
import { CustomerError, limitCustomerRequests } from "./service";
import { downloadImageFromUrl } from "./product-fetch";
import { assertActiveCustomer } from "./session";
import { assertNotRestrictedByCustomer } from "@/server/community/restrictions";

/** Same product link with tracking/affiliate parameters, fragments and trailing slashes removed. */
export function canonicalProductUrl(raw: string): string {
  const url = new URL(raw);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  for (const key of [...url.searchParams.keys()]) if (/^(utm_.*|fbclid|gclid|ref|tag|ascsubtag|cmpid)$/i.test(key)) url.searchParams.delete(key);
  return url.toString().replace(/\/$/, "");
}
export const hashProductUrl = (raw: string) => createHash("sha256").update(canonicalProductUrl(raw)).digest("hex");

const publicFields = {
  id: true, status: true, title: true, brand: true, description: true, productUrl: true, merchantName: true, categoryHint: true,
  priceMinor: true, mrpMinor: true, couponCode: true, version: true, resubmissions: true, submittedAt: true, reviewedAt: true, rejectionReason: true,
  deal: { select: { status: true, everPublished: true, slug: true } },
} as const;

function present(row: Prisma.CommunityDealSubmissionGetPayload<{ select: typeof publicFields }>) {
  const { deal, ...rest } = row;
  const live = row.status === "APPROVED" && Boolean(deal?.everPublished);
  return {
    ...rest,
    submittedAt: row.submittedAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    // Customers see a simple label; internal draft/publish steps stay private.
    stage: row.status === "REJECTED" ? "REJECTED" : row.status === "PENDING_REVIEW" ? "PENDING_REVIEW" : live ? "LIVE" : "APPROVED",
    dealSlug: live && deal?.status === "PUBLISHED" ? deal.slug : null,
    // Coarse state of the deal once it has gone live, so the member can see that it expired or was taken down.
    dealState: !live ? null : deal?.status === "PUBLISHED" ? "LIVE" : deal?.status === "EXPIRED" ? "EXPIRED" : "ARCHIVED",
    imageUrl: `/api/v1/customer/submissions/${row.id}/image`,
  };
}

async function decodeImage(bytes: Buffer | null | undefined) {
  if (!bytes?.length) throw new CustomerError("Add a product image (JPEG, PNG or WebP, up to 5 MB).");
  try {
    const normalized = await normalizeImage(bytes);
    const storage = await storeImage(normalized.bytes);
    return { storage, normalized };
  } catch (error) {
    throw new CustomerError(error instanceof Error ? error.message : "That image could not be used.");
  }
}

async function assertNotAlreadyListed(productUrl: string) {
  const listed = await getDatabase().deal.findFirst({ where: { productUrl, status: "PUBLISHED" }, select: { id: true } });
  if (listed) throw new CustomerError("This deal is already listed on MetaDeals4U.", 409);
}

export async function createSubmission(customerId: string, rawFields: unknown, imageBytes: Buffer | null) {
  const customer = await assertActiveCustomer(customerId);
  await assertNotRestrictedByCustomer(customer.id); // a moderator's posting restriction also covers community deal submissions
  const input: SubmissionInput = submissionSchema.parse(rawFields); // invalid payloads are cheap and do not use up the quota
  await limitCustomerRequests(`submit:${customer.id}`, 5, 3600);
  await limitCustomerRequests(`submit-day:${customer.id}`, 15, 86_400);
  const db = getDatabase();
  const urlHash = hashProductUrl(input.productUrl);

  const existing = await db.communityDealSubmission.findUnique({ where: { customerId_urlHash: { customerId: customer.id, urlHash } }, select: { id: true, status: true } });
  if (existing) {
    throw new CustomerError(existing.status === "REJECTED" ? "You already sent this link and it was not approved. Open it under My submissions to fix and resubmit." : "You have already submitted this link.", 409);
  }
  await assertNotAlreadyListed(input.productUrl);

  const { storage, normalized } = await decodeImage(imageBytes?.length ? imageBytes : input.imageUrl ? await downloadImageFromUrl(input.imageUrl) : null);
  try {
    const row = await db.communityDealSubmission.create({
      data: {
        customerId: customer.id, title: input.title, brand: input.brand || null, description: input.description, productUrl: input.productUrl, urlHash,
        merchantName: input.merchantName || null, categoryHint: input.categoryHint || null, priceMinor: input.priceMinor, mrpMinor: input.mrpMinor ?? null,
        couponCode: input.couponCode ? input.couponCode.toUpperCase() : null,
        imageKey: storage.storageKey, imageProvider: storage.provider, imageMime: normalized.mimeType, imageBytes: normalized.bytes.length,
        imageWidth: normalized.width, imageHeight: normalized.height,
      },
      select: publicFields,
    });
    return present(row);
  } catch (error) {
    await removeStoredImage(storage.provider, storage.storageKey);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new CustomerError("You have already submitted this link.", 409);
    throw error;
  }
}

export async function listOwnSubmissions(customerId: string) {
  await assertActiveCustomer(customerId);
  const rows = await getDatabase().communityDealSubmission.findMany({ where: { customerId }, orderBy: { submittedAt: "desc" }, take: 100, select: publicFields });
  return rows.map(present);
}

/** Ownership is part of the query: another customer's id simply finds nothing. */
export async function getOwnSubmission(customerId: string, id: string) {
  await assertActiveCustomer(customerId);
  const row = await getDatabase().communityDealSubmission.findFirst({ where: { id, customerId }, select: publicFields });
  if (!row) throw new CustomerError("Submission not found.", 404);
  return present(row);
}

export async function getOwnSubmissionImage(customerId: string, id: string) {
  await assertActiveCustomer(customerId);
  const row = await getDatabase().communityDealSubmission.findFirst({ where: { id, customerId }, select: { imageKey: true, imageProvider: true, imageMime: true } });
  if (!row) throw new CustomerError("Submission not found.", 404);
  return { bytes: await readImage(row.imageProvider, row.imageKey), mimeType: row.imageMime };
}

/** Only a rejected submission can be fixed and sent again; it goes back to the review queue. */
export async function resubmit(customerId: string, id: string, rawFields: unknown, rawVersion: unknown, imageBytes: Buffer | null) {
  const customer = await assertActiveCustomer(customerId);
  await assertNotRestrictedByCustomer(customer.id);
  const { version } = resubmitSchema.parse({ version: rawVersion });
  const input = submissionSchema.parse(rawFields);
  await limitCustomerRequests(`submit:${customer.id}`, 5, 3600);
  const db = getDatabase();
  const current = await db.communityDealSubmission.findFirst({ where: { id, customerId: customer.id }, select: { id: true, status: true, urlHash: true, imageKey: true, imageProvider: true } });
  if (!current) throw new CustomerError("Submission not found.", 404);
  if (current.status !== "REJECTED") throw new CustomerError("Only a rejected submission can be edited and resubmitted.", 409);

  const urlHash = hashProductUrl(input.productUrl);
  if (urlHash !== current.urlHash) {
    if (await db.communityDealSubmission.findUnique({ where: { customerId_urlHash: { customerId: customer.id, urlHash } }, select: { id: true } })) throw new CustomerError("You have already submitted that link.", 409);
    await assertNotAlreadyListed(input.productUrl);
  }
  const image = imageBytes?.length ? await decodeImage(imageBytes) : input.imageUrl ? await decodeImage(await downloadImageFromUrl(input.imageUrl)) : null;
  try {
    const changed = await db.communityDealSubmission.updateMany({
      where: { id, customerId: customer.id, status: "REJECTED", version },
      data: {
        title: input.title, brand: input.brand || null, description: input.description, productUrl: input.productUrl, urlHash,
        merchantName: input.merchantName || null, categoryHint: input.categoryHint || null, priceMinor: input.priceMinor, mrpMinor: input.mrpMinor ?? null,
        couponCode: input.couponCode ? input.couponCode.toUpperCase() : null,
        ...(image ? { imageKey: image.storage.storageKey, imageProvider: image.storage.provider, imageMime: image.normalized.mimeType, imageBytes: image.normalized.bytes.length, imageWidth: image.normalized.width, imageHeight: image.normalized.height } : {}),
        status: "PENDING_REVIEW", rejectionReason: null, reviewedAt: null, reviewedById: null, submittedAt: new Date(),
        version: { increment: 1 }, resubmissions: { increment: 1 },
      },
    });
    if (changed.count !== 1) throw new CustomerError("This submission changed. Reload and try again.", 409);
  } catch (error) {
    if (image) await removeStoredImage(image.storage.provider, image.storage.storageKey);
    throw error;
  }
  return getOwnSubmission(customer.id, id);
}
