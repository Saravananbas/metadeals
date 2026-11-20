import "server-only";
import { getDatabase } from "@/server/db/client";

/** "Boat " / "BOAT" / "b.o.a.t" all give the same key, so matching never depends on capitals or spacing. */
export const brandSlug = (name: string) => name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);

/** The known brand for a fetched name, or null. Looked up by key, not by a LIKE search (which fails on the staging MariaDB). */
export async function findBrand(name: string) {
  const slug = brandSlug(name);
  return slug ? getDatabase().brand.findUnique({ where: { slug }, select: { name: true } }) : null;
}

/** Remembers a brand when staff approve a deal that uses it, so the next member's fetch can match it. */
export async function ensureBrand(name: string) {
  const clean = name.trim().slice(0, 100);
  const slug = brandSlug(clean);
  if (!slug) return;
  await getDatabase().brand.upsert({ where: { slug }, update: {}, create: { name: clean, slug } }).catch(() => {});
}
