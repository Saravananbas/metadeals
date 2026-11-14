import { redirect } from "next/navigation";
import { getCurrentAuthContext } from "@/server/auth/session";
import { roleCan } from "@/server/auth/permissions";

export default async function ProtectedAdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const context = await getCurrentAuthContext();
  if (!context) redirect("/admin/login");
  // Community moderators have their own dashboard and no access to anything in this area.
  if (context.user.role === "COMMUNITY_MODERATOR") redirect("/moderator");
  if (!roleCan(context.user.role, "deal:edit") && !roleCan(context.user.role, "account:read")) {
    redirect("/admin/login");
  }
  return children;
}
