import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CommunityShell } from "@/features/community/components/Shell";
import { ModeratorInvite } from "@/features/profile/ModeratorInvite";
import { communityPageViewer } from "@/server/community/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Moderator invitation | MetaDeals4U", robots: { index: false, follow: false } };

export default async function ModeratorInvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  if (!(await communityPageViewer())) redirect("/account");
  const { token } = await searchParams;
  return <CommunityShell><ModeratorInvite token={(token ?? "").slice(0, 200)} /></CommunityShell>;
}
