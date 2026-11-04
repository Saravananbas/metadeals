import { redirect } from "next/navigation";
import { AdminDashboard } from "../components/admin-dashboard";
import { getCurrentAuthContext } from "@/server/auth/session";
import { roleCan } from "@/server/auth/permissions";
import { getDatabase } from "@/server/db/client";

export default async function AdminHomePage() {
  const context = await getCurrentAuthContext();
  if (!context) redirect("/admin/login");
  if (!roleCan(context.user.role, "account:read")) redirect("/admin/deals");
  const db = getDatabase();
  const [users, events] = await Promise.all([
    db.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, email: true, name: true, role: true, status: true, totpEnabledAt: true, createdAt: true },
    }),
    context.user.role === "SUPER_ADMIN"
      ? db.auditEvent.findMany({
          orderBy: { createdAt: "desc" },
          take: 100,
          select: {
            id: true,
            action: true,
            success: true,
            createdAt: true,
            actor: { select: { id: true, email: true, role: true } },
          },
        })
      : Promise.resolve([]),
  ]);
  const initialAccounts = users.map((user) => ({
    ...user,
    createdAt: user.createdAt.toISOString(),
    totpEnabledAt: user.totpEnabledAt?.toISOString() ?? null,
  }));
  const initialEvents = events.map((event) => ({ ...event, createdAt: event.createdAt.toISOString() }));
  return <AdminDashboard actorId={context.user.id} role={context.user.role} initialAccounts={initialAccounts} initialEvents={initialEvents} />;
}
