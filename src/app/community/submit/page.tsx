import type { Metadata } from "next";
import { CommunityShell } from "@/features/community/components/Shell";
import { SubmitPost } from "@/features/community/components/SubmitPost";
import { communityPageViewer } from "@/server/community/session";
import { listCommunities } from "@/server/community/service";
import { getDatabase } from "@/server/db/client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New post | MetaDeals4U Community", robots: { index: false, follow: false } };

export default async function SubmitPage({ searchParams }: { searchParams: Promise<{ community?: string }> }) {
  const customerId = await communityPageViewer();
  const communities = await listCommunities(customerId);
  const categories = await getDatabase().category.findMany({ orderBy: { name: "asc" }, select: { slug: true, name: true, parentId: true, id: true } });
  const slugOf = (c: { slug: string }) => c.slug.slice(0, 40).replace(/-+$/, "");
  const known = new Set(communities.map((c) => c.slug));
  const tree = categories.filter((c) => known.has(slugOf(c))).map((c) => ({ id: c.id, parentId: c.parentId, slug: slugOf(c), name: c.name }));
  return (
    <CommunityShell active="submit">
      <h1 style={{ margin: 0 }}>New post</h1>
      {communities.length ? <SubmitPost communities={communities.map((c) => ({ slug: c.slug, name: c.name }))} tree={tree} defaultCommunity={(await searchParams).community} /> : <p>There are no communities yet.</p>}
    </CommunityShell>
  );
}
