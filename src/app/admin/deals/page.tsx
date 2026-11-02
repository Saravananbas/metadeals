import { redirect } from "next/navigation";
import { getCurrentAuthContext } from "@/server/auth/session";
import { DealManager } from "@/features/deals/components/DealManager";
export default async function DealAdminPage() {
  const context = await getCurrentAuthContext();
  if (!context) redirect("/admin/login");
  return <DealManager role={context.user.role} />;
}
