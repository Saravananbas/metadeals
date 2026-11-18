import { redirect } from "next/navigation";
import { LoginForm } from "../components/auth-forms";
import { getCurrentAuthContext } from "@/server/auth/session";
import { can } from "@/server/auth/permissions";
import { firstAllowedPath, hasAnyModule } from "@/server/auth/modules";

export default async function AdminLoginPage() {
  const context = await getCurrentAuthContext();
  if (context && (can(context.user, "account:read") || hasAnyModule(context.user))) redirect(firstAllowedPath(context.user));
  if (context) redirect("/admin/deals");
  return <LoginForm />;
}
