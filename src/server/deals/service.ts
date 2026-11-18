import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getAuthEnv } from "@/config/env";
import { can, type Permission, type AdminRole } from "@/server/auth/permissions";
import { resolveAccess } from "@/server/auth/access";
import { suspensionBlocks } from "@/server/auth/suspension";
import { dealInputSchema, categoryInputSchema, merchantInputSchema } from "@/features/deals/validation";
import { dealInclude, merchantSelect, type DealDatabase, type DealRecord } from "./repository";

export class DealError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export type DealActor = { id: string; role: AdminRole };
export async function assertDealPermission(db: DealDatabase, actor: DealActor, permission: Permission) {
  const user = await db.user.findUnique({ where: { id: actor.id } });
  if (!user || user.status !== "ACTIVE" || suspensionBlocks(user) || !user.totpEnabledAt || !can({ role: user.role, permissions: await resolveAccess(user.id) }, permission)) throw new DealError("Permission denied.", 403);
}
function snapshot(deal: DealRecord) {
  return JSON.parse(JSON.stringify({ ...deal, category: undefined, merchant: undefined, media: undefined }));
}
async function audit(db: DealDatabase, actor: DealActor, action: string, id: string, before: DealRecord | null, after: DealRecord | null) {
  await db.auditEvent.create({ data: { actorId: actor.id, action, targetId: id, success: true, metadata: { before: before ? snapshot(before) : null, after: after ? snapshot(after) : null } } });
}
export async function getAdminDeal(db: DealDatabase, id: string) {
  const deal = await db.deal.findUnique({ where: { id }, include: dealInclude });
  if (!deal) throw new DealError("Deal not found.", 404);
  return deal;
}
/**
 * moderatorDraft: used only when a community moderator approves a member's submission. It allows exactly one thing: creating a NEW deal as a DRAFT with
 * no affiliate link and no purchase options. Anything else (editing, any other status, affiliate data) is refused, so this can never publish.
 */
export type SaveDealOptions = { moderatorDraft?: boolean };
export async function saveDeal(db: DealDatabase, actor: DealActor, raw: unknown, id?: string, version?: number, saveOptions: SaveDealOptions = {}) {
  if (saveOptions.moderatorDraft) {
    if (id) throw new DealError("Moderators cannot edit deals.", 403);
    await assertDealPermission(db, actor, "mod:submission:review");
  } else await assertDealPermission(db, actor, id ? "deal:edit" : "deal:create");
  const input = dealInputSchema.parse(raw);
  if (saveOptions.moderatorDraft && (input.status !== "DRAFT" || input.affiliateUrl || input.options.length || input.publishedAt || input.featured || input.trending)) {
    throw new DealError("Moderators can only create a plain draft.", 403);
  }
  const before = id ? await getAdminDeal(db, id) : null;
  if (before?.status === "ARCHIVED") throw new DealError("Archived deals cannot be edited.", 409);
  if (before && before.version !== version) throw new DealError("This deal changed. Reload before saving.", 409);
  if (input.affiliateUrl !== (before?.affiliateUrl ?? null)) await assertDealPermission(db, actor, "affiliate:manage");
  if (JSON.stringify(input.options.filter((o) => o.affiliateUrl).map((o) => [o.merchantId,o.affiliateUrl]).sort()) !== JSON.stringify(before?.options.filter((o) => o.affiliateUrl).map((o) => [o.merchantId,o.affiliateUrl]).sort() ?? [])) await assertDealPermission(db, actor, "affiliate:manage");
  const galleryMediaIds = input.galleryMediaIds ?? [];
  const [category, merchant, media, galleryMedia] = await Promise.all([
    db.category.findUnique({ where: { id: input.categoryId } }),
    db.merchant.findUnique({ where: { id: input.merchantId }, select: merchantSelect }),
    db.media.findUnique({ where: { id: input.mediaId } }),
    galleryMediaIds.length ? db.media.findMany({ where: { id: { in: galleryMediaIds } }, select: { id: true } }) : Promise.resolve([]),
  ]);
  if (!category || !merchant || !media) throw new DealError("Select an existing category, merchant and uploaded image.");
  if (galleryMedia.length !== galleryMediaIds.length) throw new DealError("One or more gallery images are unavailable. Import them again before saving.");
  const { options, ...fields } = input;
  delete fields.galleryMediaIds;
  const data = { ...fields, publishedAt: input.publishedAt ? new Date(input.publishedAt) : null, startsAt: input.startsAt ? new Date(input.startsAt) : null, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null, updatedById: actor.id };
  let result: DealRecord;
  if (before) {
    const changed = await db.deal.updateMany({ where: { id, version }, data: { ...data, version: { increment: 1 } } });
    if (changed.count !== 1) throw new DealError("Concurrent edit. Reload before saving.", 409);
    result = await getAdminDeal(db, before.id);
  } else {
    result = await db.deal.create({ data: { ...data, createdById: actor.id }, include: dealInclude });
  }
  await db.dealGalleryImage.deleteMany({ where: { dealId: result.id } });
  if (galleryMediaIds.length) {
    await db.dealGalleryImage.createMany({
      data: galleryMediaIds.map((mediaId, index) => ({ dealId: result.id, mediaId, position: index + 1 })),
    });
  }
  await db.purchaseOption.deleteMany({ where: { dealId: result.id } });
  if (options.length) await db.purchaseOption.createMany({ data: options.map((o) => ({ ...o, dealId: result.id })) });
  result = await getAdminDeal(db, result.id);
  await audit(db, actor, before ? "deal.updated" : "deal.created", result.id, before, result);
  return result;
}
function signature(value: string) { return createHmac("sha256", getAuthEnv().AUTH_SESSION_SECRET).update(value).digest("base64url"); }
export function previewToken(actorId: string, dealId: string, version: number, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ actorId, dealId, version, expires: now + 600_000 })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}
export function validPreview(token: string, actorId: string, dealId: string, version: number, now = Date.now()) {
  try {
    const [payload, mac, extra] = token.split(".");
    const expected = signature(payload);
    if (extra || !mac || mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return false;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return data.actorId === actorId && data.dealId === dealId && data.version === version && data.expires > now;
  } catch { return false; }
}
export async function changeDealState(db: DealDatabase, actor: DealActor, id: string, action: "publish" | "archive" | "delete" | "restore", version: number, token?: string) {
  await assertDealPermission(db, actor, action === "publish" ? "deal:publish" : "deal:archive");
  const before = await getAdminDeal(db, id);
  if (before.version !== version) throw new DealError("This deal changed. Reload first.", 409);
  if (action === "delete") {
    // Any status may be deleted (the admin UI confirms first); clicks and transactions keep their rows, the audit log keeps the snapshot.
    const result = await db.deal.deleteMany({ where: { id, version } });
    if (result.count !== 1) throw new DealError("Concurrent edit. Reload first.", 409);
    await audit(db, actor, "deal.deleted", id, before, null);
    return null;
  }
  const now = new Date();
  if (action === "restore") {
    // Deleted (archived) deals can be brought back. They return as a draft, so nothing goes live again until someone publishes it.
    if (before.status !== "ARCHIVED") throw new DealError("Only a deleted deal can be restored.", 409);
    const restored = await db.deal.updateMany({ where: { id, version }, data: { status: "DRAFT", updatedById: actor.id, version: { increment: 1 } } });
    if (restored.count !== 1) throw new DealError("Concurrent edit. Reload first.", 409);
    const after = await getAdminDeal(db, id);
    await audit(db, actor, "deal.restored", id, before, after);
    return after;
  }
  if (action === "publish") {
    if (!["DRAFT", "PENDING_REVIEW"].includes(before.status)) throw new DealError("Only a draft or pending review can be published.", 409);
    if (!token || !validPreview(token, actor.id, id, version)) throw new DealError("Preview the saved version before publishing.", 409);
    if (before.expiresAt && before.expiresAt <= now) throw new DealError("An expired offer cannot be published.");
  }
  const result = await db.deal.updateMany({ where: { id, version }, data: {
    status: action === "publish" ? "PUBLISHED" : "ARCHIVED", updatedById: actor.id, version: { increment: 1 },
    ...(action === "publish" ? { everPublished: true, publishedAt: before.publishedAt ?? now } : {}),
  } });
  if (result.count !== 1) throw new DealError("Concurrent edit. Reload first.", 409);
  const after = await getAdminDeal(db, id);
  await audit(db, actor, `deal.${action === "publish" ? "published" : "archived"}`, id, before, after);
  return after;
}

export async function setDealExpired(db: DealDatabase, actor: DealActor, id: string, expired: boolean, version: number) {
  await assertDealPermission(db, actor, "deal:publish");
  const before = await getAdminDeal(db, id);
  if (before.version !== version) throw new DealError("This deal changed. Reload first.", 409);
  if (!before.everPublished || !["PUBLISHED", "EXPIRED"].includes(before.status)) {
    throw new DealError("Only previously published deals can be marked active or expired.", 409);
  }
  if (!expired && before.expiresAt && before.expiresAt <= new Date()) {
    throw new DealError("The scheduled expiry has passed. Update the expiry date before reactivating this deal.", 409);
  }
  const nextStatus = expired ? "EXPIRED" : "PUBLISHED";
  if (before.status === nextStatus) return before;
  const changed = await db.deal.updateMany({
    where: { id, version, status: before.status },
    data: { status: nextStatus, updatedById: actor.id, version: { increment: 1 } },
  });
  if (changed.count !== 1) throw new DealError("Concurrent edit. Reload first.", 409);
  const after = await getAdminDeal(db, id);
  await audit(db, actor, expired ? "deal.expired" : "deal.reactivated", id, before, after);
  return after;
}
export async function saveTaxonomy(db: DealDatabase, actor: DealActor, kind: "categories" | "merchants", raw: unknown, id?: string) {
  await assertDealPermission(db, actor, kind === "categories" ? "category:manage" : "merchant:manage");
  if (kind === "categories") {
    let parentId = categoryInputSchema.parse(raw).parentId;
    const seen = new Set(id ? [id] : []);
    while (parentId) {
      if (seen.has(parentId)) throw new DealError("Category hierarchy cannot contain cycles.");
      seen.add(parentId);
      const parent = await db.category.findUnique({ where: { id: parentId } });
      if (!parent) throw new DealError("Parent category not found.");
      parentId = parent.parentId;
    }
  }
  const record = kind === "categories"
    ? await (id ? db.category.update({ where: { id }, data: categoryInputSchema.parse(raw) }) : db.category.create({ data: categoryInputSchema.parse(raw) }))
    : await (id ? db.merchant.update({ where: { id }, data: merchantInputSchema.parse(raw), select: merchantSelect }) : db.merchant.create({ data: merchantInputSchema.parse(raw), select: merchantSelect }));
  await db.auditEvent.create({ data: { actorId: actor.id, action: `${kind}.${id ? "updated" : "created"}`, targetId: record.id, success: true, metadata: { name: record.name, slug: record.slug } } });
  return record;
}
