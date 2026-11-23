import { redirect } from "next/navigation";
import { getCurrentAuthContext } from "@/server/auth/session";
import { can } from "@/server/auth/permissions";
import { RetailerLinks } from "./RetailerLinks";

export const dynamic = "force-dynamic";

export default async function AffiliateRetailersPage() {
  const context = await getCurrentAuthContext();
  if (!context) redirect("/admin/login");
  if (!can(context.user, "affiliate:view")) redirect("/admin");
  return <RetailerLinks canManage={can(context.user, "affiliate:manage")} />;
}
