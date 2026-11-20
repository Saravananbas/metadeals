import "server-only";
import { Prisma } from "@/generated/prisma-mariadb/client";
import { getDatabase } from "@/server/db/client";
import { limitCustomerRequests } from "@/server/customer/service";
import { assertActiveCustomer } from "@/server/customer/session";
import { usesMariaDb } from "@/server/community/like-search";

/** User names that start with what the member typed after "@" (up to 6, public facts only: user name and whether they have a picture). */
export async function searchMentions(customerId: string, q: string) {
  await assertActiveCustomer(customerId);
  await limitCustomerRequests(`mention-search:${customerId}`, 600, 3600);
  const text = q.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 30);
  if (!text) return { items: [] };
  const db = getDatabase();
  let ids: string[] | null = null;
  if (usesMariaDb()) {
    // Prisma's generated LIKE fails on the MariaDB host (collation mix), so the pattern is passed as one prepared value.
    const rows = await (db as unknown as { $queryRaw: <T>(s: Prisma.Sql) => Promise<T> }).$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM ForumProfile WHERE handle LIKE ${`${text.replace(/[\%_]/g, "\$&")}%`} LIMIT 20`);
    ids = rows.map((r) => r.id);
  }
  const found = await db.forumProfile.findMany({
    where: { customer: { disabledAt: null }, ...(ids ? { id: { in: ids } } : { handle: { startsWith: text } }) },
    orderBy: { handle: "asc" }, take: 6, select: { handle: true, avatarKey: true },
  });
  return { items: found.map((f) => ({ handle: f.handle, hasAvatar: Boolean(f.avatarKey) })) };
}
