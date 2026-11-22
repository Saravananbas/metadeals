import { redirect } from "next/navigation";
import { getCurrentAuthContext } from "@/server/auth/session";
import { roleCan } from "@/server/auth/permissions";
import { UsersAdmin } from "./UsersAdmin";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const context = await getCurrentAuthContext();
  if (!context) redirect("/admin/login");
  if (!roleCan(context.user.role, "users:view")) redirect("/admin");
  return <UsersAdmin />;
}
