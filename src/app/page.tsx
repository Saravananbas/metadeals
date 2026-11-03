import { Homepage } from "@/features/home/Homepage";
import { getHomepageDeals } from "@/features/deals/service";
export const dynamic = "force-dynamic";

export default async function Home() {
  const { deals, nextCursor } = await getHomepageDeals();
  return <Homepage deals={deals} initialCursor={nextCursor} />;
}
