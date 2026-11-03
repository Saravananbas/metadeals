import { getDatabase } from "@/server/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDatabase();
  const categories = await db.category.findMany({
    select: {
      id: true,
      slug: true,
      name: true,
      parentId: true,
      _count: {
        select: {
          deals: { where: { status: "PUBLISHED" } },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return Response.json({
    data: categories.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      parentId: c.parentId,
      activeDealsCount: c._count.deals,
    })),
  });
}
