import { redirect } from "next/navigation";
import { getCurrentAuthContext } from "@/server/auth/session";
import { can } from "@/server/auth/permissions";
import { BankList } from "./BankList";

export const dynamic = "force-dynamic";

export default async function BanksPage() {
  const context = await getCurrentAuthContext();
  if (!context) redirect("/admin/login");
  if (!can(context.user, "deal:edit")) redirect("/admin");
  return <BankList canManage={can(context.user, "merchant:manage")} />;
}
