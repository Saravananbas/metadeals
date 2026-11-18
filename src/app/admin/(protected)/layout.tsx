import { redirect } from "next/navigation";
import { getCurrentAuthContext } from "@/server/auth/session";
import { can } from "@/server/auth/permissions";
import { hasAnyModule } from "@/server/auth/modules";

export default async function ProtectedAdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const context = await getCurrentAuthContext();
  if (!context) redirect("/admin/login");
  // Community moderators have their own dashboard and no access to anything in this area.
  if (context.user.role === "COMMUNITY_MODERATOR") redirect("/moderator");
  if (!hasAnyModule(context.user) && !can(context.user, "account:read")) {
    redirect("/admin/login");
  }
  return children;
}
