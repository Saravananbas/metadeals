import { redirect } from "next/navigation";
import { getCurrentAuthContext } from "@/server/auth/session";
import { roleCan } from "@/server/auth/permissions";
import { getDatabase } from "@/server/db/client";
import { scraperService } from "@/server/scraper/service";
import { ScraperDashboard } from "./ScraperDashboard";

export default async function ScraperAdminPage() {
  const context = await getCurrentAuthContext();
  if (!context) redirect("/admin/login");

  // Require either deal:edit or account:read
  if (!roleCan(context.user.role, "deal:edit") && !roleCan(context.user.role, "account:read")) {
    redirect("/admin/login");
  }

  const db = getDatabase();

  const [metricsRaw, candidatesRaw] = await Promise.all([
    scraperService.getScraperMetrics(db),
    scraperService.listCandidates(db, { limit: 20, offset: 0 }),
  ]);

  const initialMetrics = {
    ...metricsRaw,
    priceStats: {
      ...metricsRaw.priceStats,
      latestObservedAt: metricsRaw.priceStats.latestObservedAt
        ? metricsRaw.priceStats.latestObservedAt.toISOString()
        : null,
    },
  };

  const initialCandidates = {
    total: candidatesRaw.total,
    limit: candidatesRaw.limit,
    offset: candidatesRaw.offset,
    items: candidatesRaw.items.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      priceObservations: c.priceObservations?.map((p) => ({
        priceMinor: p.priceMinor,
        mrpMinor: p.mrpMinor,
        observedAt: p.observedAt.toISOString(),
      })),
    })),
  };

  return (
    <ScraperDashboard
      actorId={context.user.id}
      role={context.user.role}
      initialMetrics={initialMetrics}
      initialCandidates={initialCandidates}
    />
  );
}

