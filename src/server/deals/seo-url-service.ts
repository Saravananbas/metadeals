import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { randomInt } from "node:crypto";
import { getDatabase } from "@/server/db/client";
import { canonicalPath, primaryCategorySlug, publicIdFromSlugPart, type CategoryLike } from "@/features/deals/seo-url";

type Db = ReturnType<typeof getDatabase>;
const ID_ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

export function generatePublicId(): string {
  let id = "d";
  for (let i = 0; i < 8; i++) id += ID_ALPHABET[randomInt(ID_ALPHABET.length)];
  return id;
}

export async function loadCategoryMap(db: Db): Promise<Map<string, CategoryLike>> {
  const rows = await db.category.findMany({ select: { id: true, slug: true, parentId: true } });
  return new Map(rows.map((r) => [r.id, r]));
}

const isUniqueError = (error: unknown) => typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";

export type AssignResult = { path: string | null; publicId: string | null; changed: boolean; skipped?: "no-deal" | "no-category" };

/**
 * Makes the deal's stored address match its current title and primary category. Safe to call any number of times (idempotent) and from
 * several requests at once: the address is changed with a compare-and-set on the value that was read, so two writers can never leave
 * two different canonical addresses; the loser re-reads and recomputes. The previous address of a deal that was ever public is kept in
 * DealUrlHistory (same step, one transaction). A deal with no usable category keeps its old address and is reported as "no-category".
 */
export async function assignCanonicalPath(db: Db, dealId: string, categories?: Map<string, CategoryLike>): Promise<AssignResult> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const deal = await db.deal.findUnique({ where: { id: dealId }, select: { id: true, title: true, brand: true, categoryId: true, publicId: true, canonicalPath: true, slug: true, everPublished: true, status: true } });
    if (!deal) return { path: null, publicId: null, changed: false, skipped: "no-deal" };
    const map = categories ?? (await loadCategoryMap(db));
    let publicId = deal.publicId;
    if (!publicId) {
      const fresh = generatePublicId();
      try {
        const set = await db.deal.updateMany({ where: { id: dealId, publicId: null }, data: { publicId: fresh } });
        if (set.count !== 1) continue; // someone else assigned one: re-read
        publicId = fresh;
      } catch (error) {
        if (isUniqueError(error)) continue; // astronomically unlikely id collision: draw again
        throw error;
      }
    }
    const path = canonicalPath({ categorySlug: primaryCategorySlug(map, deal.categoryId), title: deal.title, brand: deal.brand, publicId });
    if (!path) return { path: deal.canonicalPath, publicId, changed: false, skipped: "no-category" };
    if (path === deal.canonicalPath) return { path, publicId, changed: false };
    try {
      await db.$transaction(async (tx) => {
        const old = deal.canonicalPath;
        const moved = await tx.deal.updateMany({ where: { id: dealId, canonicalPath: old }, data: { canonicalPath: path } });
        if (moved.count !== 1) throw new Error("canonical-race");
        if (old && old !== path && (deal.everPublished || deal.status === "PUBLISHED" || deal.status === "EXPIRED")) {
          const reason = old.split("/")[2] !== path.split("/")[2] ? "category" : "slug";
          await tx.dealUrlHistory.upsert({ where: { path: old }, update: {}, create: { dealId, path: old, reason } });
        }
      });
      return { path, publicId, changed: true };
    } catch (error) {
      if (error instanceof Error && error.message === "canonical-race") continue;
      if (isUniqueError(error)) continue;
      throw error;
    }
  }
  throw new Error("Could not settle the deal address after several attempts");
}

/** Records the address a deal had when it was public (idempotent). Used by the backfill for the original /deal/{slug} address. */
export async function rememberLegacyPath(db: Db, dealId: string, slug: string) {
  await db.dealUrlHistory.upsert({ where: { path: `/deal/${slug}` }, update: {}, create: { dealId, path: `/deal/${slug}`, reason: "legacy" } });
}

/** Called when a deal is deleted: its addresses stay behind so the old links answer 410 Gone instead of 404. */
export async function rememberDeletedDeal(db: Db, deal: { id: string; slug: string; canonicalPath: string | null }) {
  for (const path of [deal.canonicalPath, `/deal/${deal.slug}`]) {
    if (path) await db.dealUrlHistory.upsert({ where: { path }, update: { dealId: deal.id, reason: "deleted" }, create: { dealId: deal.id, path, reason: "deleted" } });
  }
}

export type AddressResolution =
  | { kind: "render"; dealId: string; canonical: string }
  | { kind: "redirect"; to: string; status: 301 | 308 }
  | { kind: "gone" }
  | { kind: "notfound" };

type PublicFilter = Prisma.DealWhereInput;

/**
 * Decides what a request for /deal/{...parts} means. Identity always comes from the deal's own public id or database id, never from guessing at words;
 * an unknown address is a 404, never a redirect to some other deal. At most one redirect: it always points straight at the current address.
 */
export async function resolveDealAddress(db: Db, parts: string[], isPublic: PublicFilter): Promise<AddressResolution> {
  const requested = "/deal/" + parts.join("/");
  const redirectOrRender = async (where: Prisma.DealWhereInput): Promise<AddressResolution | null> => {
    const deal = await db.deal.findFirst({ where: { AND: [where, isPublic] }, select: { id: true, slug: true, canonicalPath: true } });
    if (!deal) return null;
    let canonical = deal.canonicalPath;
    if (!canonical) canonical = (await assignCanonicalPath(db, deal.id)).path; // lazy: a deal not yet migrated gets its address on first visit
    if (!canonical) return { kind: "render", dealId: deal.id, canonical: `/deal/${deal.slug}` }; // no usable category: stay on the old address, flagged for correction
    return canonical === requested ? { kind: "render", dealId: deal.id, canonical } : { kind: "redirect", to: canonical, status: parts.length === 1 ? 301 : 308 };
  };

  if (parts.length === 1) {
    const [part] = parts;
    const publicId = publicIdFromSlugPart(part);
    const found = (await redirectOrRender({ OR: [{ slug: part }, { id: part }, ...(publicId ? [{ publicId }] : [])] }));
    if (found) return found;
  } else if (parts.length === 2) {
    const publicId = publicIdFromSlugPart(parts[1]);
    if (publicId) {
      const found = await redirectOrRender({ publicId });
      if (found) return found;
    }
  } else return { kind: "notfound" };

  // Not a live deal: is it an address that used to exist?
  const old = await db.dealUrlHistory.findUnique({ where: { path: requested }, select: { dealId: true } });
  if (old) {
    const found = await redirectOrRender({ id: old.dealId });
    if (found && found.kind === "redirect") return found;
    if (found?.kind === "render") return found;
    const exists = await db.deal.findUnique({ where: { id: old.dealId }, select: { id: true } });
    return exists ? { kind: "notfound" } : { kind: "gone" };
  }
  return { kind: "notfound" };
}
