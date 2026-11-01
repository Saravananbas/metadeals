import { Homepage } from "@/features/home/Homepage";
import { getHomepageDeals } from "@/features/deals/service";

export default async function Home() {
  const { deals } = await getHomepageDeals();
  return <Homepage deals={deals} />;
}
