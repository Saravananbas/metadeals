import { redirect } from "next/navigation";
import { getCurrentAuthContext } from "@/server/auth/session";
import { can } from "@/server/auth/permissions";
import { ScraperDashboard, type TabKey } from "./ScraperDashboard";

export default async function ScraperAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const context = await getCurrentAuthContext();
  if (!context) redirect("/admin/login");

  // Require either deal:edit or account:read
  if (!can(context.user, "scraper:use") && !can(context.user, "account:read")) {
    redirect("/admin/login");
  }

  const requestedTab = (await searchParams).tab;
  const allowedTabs: TabKey[] = ["overview", "review", "discovered", "published", "intelligence", "connectors"];
  const initialTab = allowedTabs.includes(requestedTab as TabKey) ? requestedTab as TabKey : "overview";

  return (
    <ScraperDashboard
      actorId={context.user.id}
      role={context.user.role}
      initialTab={initialTab}
    />
  );
}

