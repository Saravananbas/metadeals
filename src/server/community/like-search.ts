import "server-only";
import { Prisma } from "@/generated/prisma-mariadb/client";
import { getDatabase } from "@/server/db/client";

/**
 * MariaDB on the staging host rejects Prisma's generated `LIKE CONCAT(...)` (error 1267, collation mix) for contains/endsWith.
 * A plain `LIKE ?` with a prepared pattern works, so on MariaDB these lookups go through raw SQL; PostgreSQL keeps the Prisma operators.
 */
export const usesMariaDb = () => (process.env.DATABASE_URL ?? "").startsWith("mysql:");
const escapeLike = (s: string) => s.replace(/[\\%_]/g, "\\$&");
type Raw = { $queryRaw: <T>(q: Prisma.Sql) => Promise<T> };
const raw = () => getDatabase() as unknown as Raw;

/** Ids of published posts whose title, body, author handle or community name contains the text. */
export async function searchPostIdsMariaDb(text: string): Promise<string[]> {
  const p = `%${escapeLike(text)}%`;
  const rows = await raw().$queryRaw<{ id: string }[]>(Prisma.sql`SELECT p.id FROM ForumPost p JOIN ForumProfile a ON a.id = p.authorId JOIN ForumCommunity c ON c.id = p.communityId WHERE p.status = 'PUBLISHED' AND (p.title LIKE ${p} OR p.body LIKE ${p} OR a.handle LIKE ${p} OR c.name LIKE ${p}) LIMIT 1000`);
  return rows.map((r) => r.id);
}

/** Published post whose slug ends with "-<code>". */
export async function findPostByCodeMariaDb(code: string): Promise<{ id: string; slug: string } | null> {
  const suffix = `-${code}`;
  const rows = await raw().$queryRaw<{ id: string; slug: string }[]>(Prisma.sql`SELECT p.id, p.slug FROM ForumPost p JOIN ForumCommunity c ON c.id = p.communityId WHERE p.status = 'PUBLISHED' AND c.isActive = 1 AND RIGHT(p.slug, ${suffix.length}) = ${suffix} LIMIT 1`);
  return rows[0] ?? null;
}

/** Deal that people can open (published or expired) whose id ends with the code. */
export async function findDealByCodeMariaDb(code: string): Promise<{ id: string; slug: string } | null> {
  const rows = await raw().$queryRaw<{ id: string; slug: string }[]>(Prisma.sql`SELECT id, slug FROM Deal WHERE status IN ('PUBLISHED', 'EXPIRED') AND RIGHT(id, ${code.length}) = ${code} LIMIT 1`);
  return rows[0] ?? null;
}

/** Comment of the post whose id ends with the code. */
export async function findCommentByCodeMariaDb(postId: string, code: string): Promise<string | null> {
  const rows = await raw().$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM ForumComment WHERE postId = ${postId} AND RIGHT(id, ${code.length}) = ${code} LIMIT 1`);
  return rows[0]?.id ?? null;
}

/** Ids of deals matching every word group (each group = one typed word plus its synonyms) in title, brand, description, category or store name. */
export async function searchDealIdsMariaDb(groups: string[][]): Promise<string[]> {
  const cond = groups.map((terms) => Prisma.sql`(${Prisma.join(terms.map((t) => { const p = `%${escapeLike(t)}%`; return Prisma.sql`d.title LIKE ${p} OR d.brand LIKE ${p} OR d.description LIKE ${p} OR c.name LIKE ${p} OR c.slug LIKE ${p} OR m.name LIKE ${p}`; }), " OR ")})`);
  const rows = await raw().$queryRaw<{ id: string }[]>(Prisma.sql`SELECT d.id FROM Deal d JOIN Category c ON c.id = d.categoryId JOIN Merchant m ON m.id = d.merchantId WHERE ${Prisma.join(cond, " AND ")} LIMIT 2000`);
  return rows.map((r) => r.id);
}

/** Members whose user name or display name contains the text (user names starting with it first). Only members who could be invited: verified, not disabled, not suspended. */
export async function searchMembersMariaDb(text: string, limit: number): Promise<{ handle: string; displayName: string | null; avatarKey: string | null; customerId: string }[]> {
  const p = `%${escapeLike(text)}%`, starts = `${escapeLike(text)}%`;
  return raw().$queryRaw(Prisma.sql`SELECT f.handle, f.displayName, f.avatarKey, f.customerId FROM ForumProfile f JOIN Customer c ON c.id = f.customerId WHERE c.disabledAt IS NULL AND c.emailVerifiedAt IS NOT NULL AND f.status <> 'SUSPENDED' AND (f.handle LIKE ${p} OR f.displayName LIKE ${p}) ORDER BY (f.handle LIKE ${starts}) DESC, f.handle ASC LIMIT ${limit}`);
}

/** Ids of deals whose product link contains the fragment (an Amazon ASIN path or a Flipkart pid). */
export async function dealIdsByUrlFragmentMariaDb(fragment: string): Promise<string[]> {
  const p = `%${escapeLike(fragment)}%`;
  const rows = await raw().$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM Deal WHERE productUrl LIKE ${p} OR affiliateUrl LIKE ${p} LIMIT 20`);
  return rows.map((r) => r.id);
}
