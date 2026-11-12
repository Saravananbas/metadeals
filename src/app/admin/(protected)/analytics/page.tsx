import { redirect } from "next/navigation";
import { getCurrentAuthContext } from "@/server/auth/session";
import { roleCan } from "@/server/auth/permissions";
import { AnalyticsDashboard } from "./AnalyticsDashboard";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const context = await getCurrentAuthContext();
  if (!context) redirect("/admin/login");
  if (!roleCan(context.user.role, "operations:read")) redirect("/admin");
  return <AnalyticsDashboard />;
}
