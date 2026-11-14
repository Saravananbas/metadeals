import { z } from "zod";
import { readJson } from "@/server/auth/request";
import { adminApi } from "@/server/community/admin-http";
import { closeEscalation, decideAppeal, listAppeals, listEscalations, listRestrictions, openEscalated, revokeRestriction } from "@/server/community/discipline";
import { confirmModerator, extendProbation, inviteModerator, listAppointments, revokeModerator, searchInvitableMembers } from "@/server/community/moderators";
import { DealError } from "@/server/deals/service";
import { json } from "@/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Administrator side of community moderation (adminApi refuses community moderators; each service checks its own permission).
 * GET  members?q= (invite type-ahead) | moderators | appeals[?status=] | escalations | escalations/{id} (opens the hidden item, audited) | restrictions
 * POST moderators (invite) | moderators/{id}/{confirm|extend|revoke} | appeals/{id}/decide | escalations/{id}/close | restrictions/{id}/revoke
 */
async function handle(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return adminApi(request, async (actor) => {
    const [resource, id, action] = (await params).path;
    if (request.method === "GET") {
      if (resource === "members" && !id) return json({ data: await searchInvitableMembers(actor, new URL(request.url).searchParams.get("q")) });
      if (resource === "moderators" && !id) return json({ data: await listAppointments(actor) });
      if (resource === "appeals" && !id) return json({ data: await listAppeals(actor, z.enum(["OPEN", "UPHELD", "OVERTURNED"]).parse(new URL(request.url).searchParams.get("status") ?? "OPEN")) });
      if (resource === "escalations" && !id) return json({ data: await listEscalations(actor) });
      if (resource === "escalations" && id) return json({ data: await openEscalated(actor, id) });
      if (resource === "restrictions" && !id) return json({ data: await listRestrictions(actor) });
    }
    if (request.method === "POST") {
      const body = await readJson(request);
      if (resource === "moderators" && !id) return json({ data: await inviteModerator(actor, body) }, 201);
      if (resource === "moderators" && id && action === "confirm") return json({ data: await confirmModerator(actor, id, body) });
      if (resource === "moderators" && id && action === "extend") return json({ data: await extendProbation(actor, id, body) });
      if (resource === "moderators" && id && action === "revoke") return json({ data: await revokeModerator(actor, id, body) });
      if (resource === "appeals" && id && action === "decide") return json({ data: await decideAppeal(actor, id, body) });
      if (resource === "escalations" && id && action === "close") return json({ data: await closeEscalation(actor, id) });
      if (resource === "restrictions" && id && action === "revoke") return json({ data: await revokeRestriction(actor, id, body) });
    }
    throw new DealError("Not found.", 404);
  });
}
export { handle as GET, handle as POST };
