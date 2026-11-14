import "server-only";
import sharp from "sharp";
import { z } from "zod";
import { getDatabase } from "@/server/db/client";
import { CustomerError, limitCustomerRequests } from "@/server/customer/service";
import { readImage, removeStoredImage, storeImage } from "@/server/storage/media";
import { LIMITS, POST_TYPES } from "@/features/community/validation";
import { assertCommunityEnabled } from "./config";
import { writableProfile } from "./service";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const imageUrl = (id: string) => `/api/v1/community/images/${id}`;

// ---------- pictures ----------
/** A picture waiting for its post. The browser's file type and name are never trusted: the bytes are decoded and re-encoded to WebP. */
export async function stageImage(customerId: string, bytes: Buffer) {
  const { profile } = await writableProfile(customerId);
  if (!bytes.length) throw new CustomerError("Choose a picture to upload.");
  if (bytes.length > MAX_IMAGE_BYTES) throw new CustomerError("Each picture must be 5 MB or smaller.", 413);
  const db = getDatabase();
  // Pictures that never reached a post are tidied up as the member uploads more.
  await db.forumPostImage.findMany({ where: { profileId: profile.id, postId: null, createdAt: { lt: new Date(Date.now() - 86_400_000) } }, select: { id: true, provider: true, storageKey: true } })
    .then(async (old) => { for (const o of old) { await removeStoredImage(o.provider, o.storageKey).catch(() => {}); await db.forumPostImage.delete({ where: { id: o.id } }).catch(() => {}); } });
  if (await db.forumPostImage.count({ where: { profileId: profile.id, postId: null } }) >= LIMITS.maxImages) throw new CustomerError(`You can attach up to ${LIMITS.maxImages} pictures.`, 409);
  await limitCustomerRequests(`forum-image:${profile.id}`, 30, 3600);
  let webp: Buffer, width = 0, height = 0;
  try {
    const meta = await sharp(bytes, { limitInputPixels: 25_000_000 }).metadata();
    if (!["jpeg", "png", "webp"].includes(meta.format ?? "")) throw new Error("format");
    // Rotated by the camera's note; the re-encode drops all hidden metadata such as location.
    const out = await sharp(bytes, { limitInputPixels: 25_000_000, failOn: "warning" }).rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer({ resolveWithObject: true });
    webp = out.data; width = out.info.width; height = out.info.height;
  } catch {
    throw new CustomerError("Use a JPEG, PNG or WebP picture.");
  }
  const stored = await storeImage(webp);
  try {
    const row = await db.forumPostImage.create({ data: { profileId: profile.id, storageKey: stored.storageKey, provider: stored.provider, width, height, bytes: webp.length }, select: { id: true } });
    return { id: row.id, url: imageUrl(row.id), width, height };
  } catch (error) {
    await removeStoredImage(stored.provider, stored.storageKey).catch(() => {});
    throw error;
  }
}

/** Removes a picture that is not on a post yet (a post's own pictures are managed with the post). */
export async function removeStagedImage(customerId: string, id: string) {
  const { profile } = await writableProfile(customerId);
  const db = getDatabase();
  const row = await db.forumPostImage.findFirst({ where: { id, profileId: profile.id, postId: null }, select: { id: true, provider: true, storageKey: true } });
  if (!row) throw new CustomerError("Picture not found.", 404);
  await db.forumPostImage.delete({ where: { id: row.id } });
  await removeStoredImage(row.provider, row.storageKey).catch(() => {});
  return { removed: true };
}

/** Public for published posts; the owner can also see their own pictures before the post exists or while it waits for review. */
export async function readPostImage(id: string, customerId: string | null) {
  assertCommunityEnabled();
  const db = getDatabase();
  const row = await db.forumPostImage.findUnique({ where: { id }, select: { provider: true, storageKey: true, profile: { select: { customerId: true } }, post: { select: { status: true, community: { select: { isActive: true } } } } } });
  if (!row) throw new CustomerError("No picture.", 404);
  const owner = Boolean(customerId) && row.profile.customerId === customerId;
  const published = row.post?.status === "PUBLISHED" && row.post.community.isActive;
  if (!published && !owner) throw new CustomerError("No picture.", 404);
  return { bytes: await readImage(row.provider, row.storageKey), isPublic: published };
}

/** Checks that every id is this member's own unattached picture and returns them in the order given. */
export async function ownStagedImages(profileId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length !== ids.length) throw new CustomerError("A picture was listed twice.");
  if (!unique.length) return [];
  const rows = await getDatabase().forumPostImage.findMany({ where: { id: { in: unique }, profileId, postId: null }, select: { id: true } });
  if (rows.length !== unique.length) throw new CustomerError("One of the pictures is no longer available. Please add it again.", 409);
  return unique;
}

// ---------- drafts (one per member, only ever read or written by that member) ----------
const draftSchema = z.object({
  type: z.enum(POST_TYPES).default("DISCUSSION"),
  communitySlug: z.string().max(40).default(""),
  title: z.string().max(LIMITS.newPostTitle).default(""),
  bodyHtml: z.string().max(30_000).default(""),
  url: z.string().max(2048).default(""),
  merchantName: z.string().max(100).default(""),
  price: z.string().max(20).default(""),
  mrp: z.string().max(20).default(""),
  couponCode: z.string().max(50).default(""),
  notifyReplies: z.boolean().default(false),
  imageIds: z.array(z.string().max(40)).max(LIMITS.maxImages).default([]),
}).strict();
export type DraftPayload = z.infer<typeof draftSchema>;

export async function getDraft(customerId: string) {
  assertCommunityEnabled();
  const db = getDatabase();
  const profile = await db.forumProfile.findUnique({ where: { customerId }, select: { id: true } });
  if (!profile) return null;
  const row = await db.forumPostDraft.findUnique({ where: { profileId: profile.id }, select: { payload: true, updatedAt: true } });
  if (!row) return null;
  const parsed = draftSchema.safeParse(row.payload);
  if (!parsed.success) return null;
  // Pictures that were removed or already used are dropped from the restored draft.
  const images = parsed.data.imageIds.length ? await db.forumPostImage.findMany({ where: { id: { in: parsed.data.imageIds }, profileId: profile.id, postId: null }, select: { id: true } }) : [];
  const keep = new Set(images.map((i) => i.id));
  const ordered = parsed.data.imageIds.filter((id) => keep.has(id));
  return { draft: { ...parsed.data, imageIds: ordered }, images: ordered.map((id) => ({ id, url: imageUrl(id) })), savedAt: row.updatedAt.toISOString() };
}

export async function saveDraft(customerId: string, raw: unknown) {
  const { profile } = await writableProfile(customerId);
  const payload = draftSchema.parse(raw);
  await limitCustomerRequests(`forum-draft:${profile.id}`, 240, 3600);
  const row = await getDatabase().forumPostDraft.upsert({ where: { profileId: profile.id }, create: { profileId: profile.id, payload }, update: { payload }, select: { updatedAt: true } });
  return { savedAt: row.updatedAt.toISOString() };
}

export async function deleteDraft(customerId: string) {
  const db = getDatabase();
  const profile = await db.forumProfile.findUnique({ where: { customerId }, select: { id: true } });
  if (profile) await db.forumPostDraft.deleteMany({ where: { profileId: profile.id } });
  return { deleted: true };
}
