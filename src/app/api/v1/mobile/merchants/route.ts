import { getDatabase } from "@/server/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDatabase();
  const merchants = await db.merchant.findMany({
    select: {
      id: true,
      slug: true,
      name: true,
      websiteUrl: true,
      _count: {
        select: {
          deals: { where: { status: "PUBLISHED" } },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return Response.json({
    data: merchants.map((m) => ({
      id: m.id,
      slug: m.slug,
      name: m.name,
      websiteUrl: m.websiteUrl,
      activeDealsCount: m._count.deals,
    })),
  });
}
