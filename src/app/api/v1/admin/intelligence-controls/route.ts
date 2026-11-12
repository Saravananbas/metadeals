import { NextResponse } from "next/server";
import { getCurrentAuthContext } from "@/server/auth/session";
import { roleCan } from "@/server/auth/permissions";
import { Agent2PublishingEngine } from "@/server/scraper/agent2-publishing-engine";
import { getDatabase } from "@/server/db/client";

export async function GET() {
  const context = await getCurrentAuthContext();
  if (!context || !roleCan(context.user.role, "operations:read")) {
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
  if (!context || !roleCan(context.user.role, "deal:publish")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = (await request.json()) as { action: string; value?: boolean };

  if (body.action === "TOGGLE_KILL_SWITCH") {
    Agent2PublishingEngine.setKillSwitch(Boolean(body.value));
    return NextResponse.json({
      success: true,
      killSwitchActive: Agent2PublishingEngine.isKillSwitchActive(),
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
