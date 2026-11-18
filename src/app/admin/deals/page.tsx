import { redirect } from "next/navigation";
import { getCurrentAuthContext } from "@/server/auth/session";
import { can } from "@/server/auth/permissions";
import { firstAllowedPath } from "@/server/auth/modules";
import { DealManager } from "@/features/deals/components/DealManager";
export default async function DealAdminPage() {
  const context = await getCurrentAuthContext();
  if (!context) redirect("/admin/login");
  if (!can(context.user, "deal:edit")) redirect(firstAllowedPath(context.user));
  return <DealManager role={context.user.role} permissions={context.user.permissions} />;
}
