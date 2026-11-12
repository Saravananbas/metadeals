import { redirect } from "next/navigation";
import { AdminDashboard } from "../components/admin-dashboard";
import { getCurrentAuthContext } from "@/server/auth/session";
import { roleCan } from "@/server/auth/permissions";

export default async function AdminHomePage() {
  const context = await getCurrentAuthContext();
  if (!context) redirect("/admin/login");
  if (!roleCan(context.user.role, "account:read")) redirect("/admin/deals");

  return <AdminDashboard actorId={context.user.id} role={context.user.role} />;
}

