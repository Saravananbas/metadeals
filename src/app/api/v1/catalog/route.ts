import { getDatabase } from "@/server/db/client";
import { api, json } from "@/server/http";

export async function GET() {
  return api(async () => {
    const db = getDatabase();
    const [categories, merchants, merchantWebsites] = await Promise.all([
      db.category.findMany({
        orderBy: { name: "asc" },
        select: {
          id: true,
          slug: true,
          name: true,
          parentId: true,
        },
      }),
      db.merchant.findMany({
        take: 500,
        orderBy: { name: "asc" },
        select: { id: true, name: true, slug: true },
      }),
      db.merchantWebsiteDirectory.findMany({
        where: { status: "ACTIVE" },
        orderBy: { name: "asc" },
        select: { id: true, name: true, domain: true, logoUrl: true, logoMediaId: true },
      }),
    ]);
    return json({ categories, merchants, merchantWebsites: merchantWebsites.map(({ logoMediaId, ...merchant }) => ({
      ...merchant,
      logoUrl: logoMediaId ? `/api/v1/media/${logoMediaId}` : merchant.logoUrl,
    })) });
  });
}


