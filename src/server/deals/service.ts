import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getAuthEnv } from "@/config/env";
import { roleCan, type Permission, type AdminRole } from "@/server/auth/permissions";
import { dealInputSchema, categoryInputSchema, merchantInputSchema } from "@/features/deals/validation";
import { dealInclude, merchantSelect, type DealDatabase, type DealRecord } from "./repository";

export class DealError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export type DealActor = { id: string; role: AdminRole };
export async function assertDealPermission(db: DealDatabase, actor: DealActor, permission: Permission) {
  const user = await db.user.findUnique({ where: { id: actor.id } });
  if (!user || user.status !== "ACTIVE" || !user.totpEnabledAt || !roleCan(user.role, permission)) throw new DealError("Permission denied.", 403);
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
export async function saveDeal(db: DealDatabase, actor: DealActor, raw: unknown, id?: string, version?: number) {
  await assertDealPermission(db, actor, id ? "deal:edit" : "deal:create");
  const input = dealInputSchema.parse(raw);
  const before = id ? await getAdminDeal(db, id) : null;
  if (before?.status === "ARCHIVED") throw new DealError("Archived deals cannot be edited.", 409);
  if (before && before.version !== version) throw new DealError("This deal changed. Reload before saving.", 409);
  if (input.affiliateUrl !== (before?.affiliateUrl ?? null)) await assertDealPermission(db, actor, "affiliate:manage");
  if (JSON.stringify(input.options.filter((o) => o.affiliateUrl).map((o) => [o.merchantId,o.affiliateUrl]).sort()) !== JSON.stringify(before?.options.filter((o) => o.affiliateUrl).map((o) => [o.merchantId,o.affiliateUrl]).sort() ?? [])) await assertDealPermission(db, actor, "affiliate:manage");
  const [category, merchant, media] = await Promise.all([
    db.category.findUnique({ where: { id: input.categoryId } }),
    db.merchant.findUnique({ where: { id: input.merchantId }, select: merchantSelect }),
    db.media.findUnique({ where: { id: input.mediaId } }),
  ]);
  if (!category || !merchant || !media) throw new DealError("Select an existing category, merchant and uploaded image.");
  const { options, ...fields } = input;
  const data = { ...fields, publishedAt: input.publishedAt ? new Date(input.publishedAt) : null, startsAt: input.startsAt ? new Date(input.startsAt) : null, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null, updatedById: actor.id };
  let result: DealRecord;
  if (before) {
    const changed = await db.deal.updateMany({ where: { id, version }, data: { ...data, version: { increment: 1 } } });
    if (changed.count !== 1) throw new DealError("Concurrent edit. Reload before saving.", 409);
    result = await getAdminDeal(db, before.id);
  } else {
    result = await db.deal.create({ data: { ...data, createdById: actor.id }, include: dealInclude });
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
export async function changeDealState(db: DealDatabase, actor: DealActor, id: string, action: "publish" | "archive" | "delete", version: number, token?: string) {
  await assertDealPermission(db, actor, action === "publish" ? "deal:publish" : "deal:archive");
  const before = await getAdminDeal(db, id);
  if (before.version !== version) throw new DealError("This deal changed. Reload first.", 409);
  if (action === "delete") {
    if (before.everPublished || before.status !== "DRAFT") throw new DealError("Only never-published drafts can be deleted. Archive this deal instead.", 409);
    const result = await db.deal.deleteMany({ where: { id, version, status: "DRAFT", everPublished: false } });
    if (result.count !== 1) throw new DealError("Concurrent edit. Reload first.", 409);
    await audit(db, actor, "deal.deleted", id, before, null);
    return null;
  }
  const now = new Date();
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
