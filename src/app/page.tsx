import { unstable_cache } from "next/cache";
import { Homepage } from "@/features/home/Homepage";
import { getHomepageDeals } from "@/features/deals/service";
import { getDatabase } from "@/server/db/client";

export const dynamic = "force-dynamic";

// Public data is the same for every visitor, so the database is asked at most once every 30 seconds.
// shortcut: no instant clearing on publish; a new deal shows within 30 s. Add a tag and revalidateTag in the admin route if that is too slow.
const getHomeData = unstable_cache(async () => {
  const db = getDatabase();
  const [{ deals, nextCursor }, categories, merchants] = await Promise.all([
    getHomepageDeals(),
    db.category.findMany({ orderBy: { name: "asc" }, select: { id: true, slug: true, name: true, parentId: true } }),
    db.merchant.findMany({ take: 60, orderBy: { name: "asc" }, select: { id: true, slug: true, name: true } }),
  ]);
  return { deals, nextCursor, categories, merchants };
}, ["home-data"], { revalidate: 30, tags: ["public-deals"] });

export default async function Home() {
  const { deals, nextCursor, categories, merchants } = await getHomeData();
  return (
    <Homepage
      deals={deals}
      initialCursor={nextCursor}
      initialCatalog={{ categories, merchants }}
      communityEnabled={process.env.COMMUNITY_ENABLED === "true"}
    />
  );
}
