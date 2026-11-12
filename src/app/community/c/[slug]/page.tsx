import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FeedPage, type FeedParams } from "@/features/community/components/FeedPage";
import { communityPageViewer } from "@/server/community/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Community | MetaDeals4U", robots: { index: false, follow: false } };

export default async function CommunityTopicPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<FeedParams> }) {
  const customerId = await communityPageViewer();
  const page = await FeedPage({ params: await searchParams, customerId, communitySlug: (await params).slug });
  if (!page) notFound();
  return page;
}
