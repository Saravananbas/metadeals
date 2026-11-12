import type { Metadata } from "next";
import { FeedPage, type FeedParams } from "@/features/community/components/FeedPage";
import { communityPageViewer } from "@/server/community/session";

export const dynamic = "force-dynamic";
// Not indexed by search engines until the owner decides to open the community to search.
export const metadata: Metadata = { title: "Community | MetaDeals4U", robots: { index: false, follow: false } };

export default async function CommunityPage({ searchParams }: { searchParams: Promise<FeedParams> }) {
  const customerId = await communityPageViewer();
  return <FeedPage params={await searchParams} customerId={customerId} />;
}
