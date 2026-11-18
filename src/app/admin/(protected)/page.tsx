import { redirect } from "next/navigation";
import { AdminDashboard } from "../components/admin-dashboard";
import { getCurrentAuthContext } from "@/server/auth/session";
import { can } from "@/server/auth/permissions";
import { firstAllowedPath } from "@/server/auth/modules";

export default async function AdminHomePage() {
  const context = await getCurrentAuthContext();
  if (!context) redirect("/admin/login");
  if (!can(context.user, "account:read")) redirect(firstAllowedPath(context.user));

  return <AdminDashboard actorId={context.user.id} role={context.user.role} />;
}

