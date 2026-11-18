import { redirect } from "next/navigation";
import { getCurrentAuthContext } from "@/server/auth/session";
import { can } from "@/server/auth/permissions";
import { firstAllowedPath } from "@/server/auth/modules";
import { CuelinksDashboard } from "./CuelinksDashboard";

export default async function CuelinksAdminPage() {
  const context = await getCurrentAuthContext();
  if (!context) redirect("/admin/login");

  if (!can(context.user, "affiliate:view")) {
    redirect(firstAllowedPath(context.user));
  }

  return <CuelinksDashboard role={context.user.role} />;
}

