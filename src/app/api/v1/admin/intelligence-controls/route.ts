import { NextResponse } from "next/server";
import { getCurrentAuthContext } from "@/server/auth/session";
import { can } from "@/server/auth/permissions";
import { Agent2PublishingEngine } from "@/server/scraper/agent2-publishing-engine";
import { getDatabase } from "@/server/db/client";
import { assertSameOrigin, readJson } from "@/server/auth/request";

export async function GET() {
  const context = await getCurrentAuthContext();
  if (!context || !can(context.user, "intelligence:view")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDatabase();
  const [
    sourcesCount,
    healthySourcesCount,
    pendingApprovalsCount,
    shadowCandidatesCount,
    lifecycleEventsCount,
  ] = await Promise.all([
    db.sourceHealthRecord.count(),
    db.sourceHealthRecord.count({ where: { state: "HEALTHY" } }),
    db.publicationAuthorization.count({ where: { status: "PENDING_APPROVAL" } }),
    db.shadowCandidate.count(),
    db.dealLifecycleEvent.count(),
  ]);

  return NextResponse.json({
    killSwitchActive: Agent2PublishingEngine.isKillSwitchActive(),
    agent1Status: "ACTIVE",
    agent2Status: "ACTIVE",
    agent3Status: "SHADOW_MODE_ONLY",
    telemetry: {
      totalSources: sourcesCount,
      healthySources: healthySourcesCount,
      pendingApprovals: pendingApprovalsCount,
      shadowDiscoveries: shadowCandidatesCount,
      lifecycleEvents: lifecycleEventsCount,
    },
  });
}

export async function POST(request: Request) {
  const context = await getCurrentAuthContext();
  if (!context || !can(context.user, "deal:publish")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  if (!assertSameOrigin(request)) return NextResponse.json({ error: "Request origin could not be verified." }, { status: 403 });

  let body: { action?: unknown; value?: unknown };
  try { body = (await readJson(request)) as { action?: unknown; value?: unknown }; } catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }); }

  if (body.action === "TOGGLE_KILL_SWITCH") {
    const activate = Boolean(body.value);
    // Switching the safety stop ON is open to anyone who can publish; switching it OFF needs an operations role.
    if (!activate && !can(context.user, "intelligence:view")) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    Agent2PublishingEngine.setKillSwitch(activate);
    await getDatabase().auditEvent.create({ data: { actorId: context.user.id, action: "intelligence.kill_switch", targetId: "agent2", success: true, metadata: { active: activate } } });
    return NextResponse.json({
      success: true,
      killSwitchActive: Agent2PublishingEngine.isKillSwitchActive(),
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
