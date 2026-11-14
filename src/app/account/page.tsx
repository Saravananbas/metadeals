import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { CustomerAccount } from "@/features/customer/CustomerAccount";
import { CommunityShell } from "@/features/community/components/Shell";
import { ProfileDashboard, type Tab } from "@/features/account/ProfileDashboard";
import { customerProviders, getCustomerAuthOptions } from "@/server/customer/options";
import { emailMode } from "@/server/customer/email";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My Profile | MetaDeals4U", robots: { index: false, follow: false } };
const TABS: Tab[] = ["profile", "deals", "activity", "saved", "notifications", "settings"];

/** Signed-in members get their profile, deals, activity, saved deals, notifications and security in one place; visitors get sign-in. */
export default async function AccountPage({ searchParams }: { searchParams: Promise<{ error?: string; tab?: string; edit?: string }> }) {
  const { error, tab, edit } = await searchParams;
  let signedIn = false;
  try { signedIn = Boolean((await getServerSession(getCustomerAuthOptions()))?.user?.id); } catch { signedIn = false; }
  if (!signedIn) return <CustomerAccount providers={customerProviders()} delivery={emailMode()} oauthError={Boolean(error)} />;
  const active = TABS.includes(tab as Tab) ? (tab as Tab) : "profile";
  return <CommunityShell><ProfileDashboard tab={active} edit={edit === "1" && active === "profile"} /></CommunityShell>;
}
