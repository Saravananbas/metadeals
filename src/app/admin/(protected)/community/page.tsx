import { redirect } from "next/navigation";
import { getCurrentAuthContext } from "@/server/auth/session";
import { roleCan } from "@/server/auth/permissions";
import { CommunityModeration } from "./CommunityModeration";

export const dynamic = "force-dynamic";

export default async function CommunityAdminPage() {
  const context = await getCurrentAuthContext();
  if (!context) redirect("/admin/login");
  if (!roleCan(context.user.role, "forum:moderate")) redirect("/admin");
  return <CommunityModeration canManage={roleCan(context.user.role, "forum:manage")} />;
}
