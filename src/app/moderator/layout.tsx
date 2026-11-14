import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentAuthContext } from "@/server/auth/session";
import { checkModeratorAccess } from "@/server/community/moderator-access";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Moderator | MetaDeals4U", robots: { index: false, follow: false } };

/**
 * Separate from the general admin area: only an active, appointed community moderator gets in. Administrators are sent to the admin
 * community pages; everyone else to the staff sign-in. The same check runs again on every moderator API call.
 */
export default async function ModeratorLayout({ children }: { children: React.ReactNode }) {
  const context = await getCurrentAuthContext();
  if (!context) redirect("/admin/login");
  if (context.user.role === "ADMIN" || context.user.role === "SUPER_ADMIN") redirect("/admin/community");
  try { await checkModeratorAccess(context.user.id); } catch { redirect("/admin/login"); }
  return children;
}
