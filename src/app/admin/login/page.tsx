import { redirect } from "next/navigation";
import { LoginForm } from "../components/auth-forms";
import { getCurrentAuthContext } from "@/server/auth/session";
import { roleCan } from "@/server/auth/permissions";

export default async function AdminLoginPage() {
  const context = await getCurrentAuthContext();
  if (context && roleCan(context.user.role, "account:read")) redirect("/admin");
  if (context) redirect("/admin/deals");
  return <LoginForm />;
}
