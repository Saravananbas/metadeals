import type { Metadata } from "next";
import { CommunityShell } from "@/features/community/components/Shell";
import { MyActivity } from "@/features/community/components/MyActivity";
import { communityPageViewer } from "@/server/community/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My activity | MetaDeals4U Community", robots: { index: false, follow: false } };

export default async function MyActivityPage() {
  await communityPageViewer();
  return (
    <CommunityShell active="me">
      <h1 style={{ margin: 0 }}>My activity</h1>
      <MyActivity />
    </CommunityShell>
  );
}
