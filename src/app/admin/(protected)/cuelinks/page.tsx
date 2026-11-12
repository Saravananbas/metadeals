import { redirect } from "next/navigation";
import { getCurrentAuthContext } from "@/server/auth/session";
import { roleCan } from "@/server/auth/permissions";
import { CuelinksDashboard } from "./CuelinksDashboard";

export default async function CuelinksAdminPage() {
  const context = await getCurrentAuthContext();
  if (!context) redirect("/admin/login");

  if (!roleCan(context.user.role, "deal:edit") && !roleCan(context.user.role, "account:read")) {
    redirect("/admin/login");
  }

  return <CuelinksDashboard role={context.user.role} />;
}

