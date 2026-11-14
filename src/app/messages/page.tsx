import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CommunityShell } from "@/features/community/components/Shell";
import { Messages } from "@/features/messages/Messages";
import { communityPageViewer } from "@/server/community/session";
import { messagesEnabled } from "@/server/messages/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Messages | MetaDeals4U", robots: { index: false, follow: false } };

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ to?: string; t?: string }> }) {
  if (!messagesEnabled()) notFound();
  if (!(await communityPageViewer())) redirect("/account");
  const { to, t } = await searchParams;
  return <CommunityShell><Messages to={to?.slice(0, 30)} thread={t?.slice(0, 40)} /></CommunityShell>;
}
