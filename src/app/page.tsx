import { Homepage } from "@/features/home/Homepage";
import { getHomepageDeals } from "@/features/deals/service";
import { getDatabase } from "@/server/db/client";

export const dynamic = "force-dynamic";

export default async function Home() {
  const db = getDatabase();
  const [{ deals, nextCursor }, categories, merchants] = await Promise.all([
    getHomepageDeals(),
    db.category.findMany({
      orderBy: { name: "asc" },
      select: { id: true, slug: true, name: true, parentId: true },
    }),
    db.merchant.findMany({
      take: 60,
      orderBy: { name: "asc" },
      select: { id: true, slug: true, name: true },
    }),
  ]);

  return (
    <Homepage
      deals={deals}
      initialCursor={nextCursor}
      initialCatalog={{ categories, merchants }}
    />
  );
}
