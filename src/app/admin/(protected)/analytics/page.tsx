import { redirect } from "next/navigation";
import { getCurrentAuthContext } from "@/server/auth/session";
import { can } from "@/server/auth/permissions";
import { firstAllowedPath } from "@/server/auth/modules";
import { AnalyticsDashboard } from "./AnalyticsDashboard";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const context = await getCurrentAuthContext();
  if (!context) redirect("/admin/login");
  if (!can(context.user, "analytics:view")) redirect(firstAllowedPath(context.user));
  return <AnalyticsDashboard />;
}
