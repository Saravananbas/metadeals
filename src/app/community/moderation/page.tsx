import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CommunityShell } from "@/features/community/components/Shell";
import { MyModeration } from "@/features/profile/MyModeration";
import { communityPageViewer } from "@/server/community/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Moderation notices | MetaDeals4U", robots: { index: false, follow: false } };

export default async function ModerationNoticesPage() {
  if (!(await communityPageViewer())) redirect("/account");
  return <CommunityShell><MyModeration /></CommunityShell>;
}
