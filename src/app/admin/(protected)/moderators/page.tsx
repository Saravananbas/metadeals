import { redirect } from "next/navigation";
import { getCurrentAuthContext } from "@/server/auth/session";
import { roleCan } from "@/server/auth/permissions";
import { ModeratorsAdmin } from "./ModeratorsAdmin";

export const dynamic = "force-dynamic";

export default async function ModeratorsPage() {
  const context = await getCurrentAuthContext();
  if (!context) redirect("/admin/login");
  if (!roleCan(context.user.role, "mod:appoint")) redirect("/admin");
  return <ModeratorsAdmin />;
}
