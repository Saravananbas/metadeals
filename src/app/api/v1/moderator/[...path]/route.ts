import { z } from "zod";
import { readJson } from "@/server/auth/request";
import { moderatorApi } from "@/server/community/moderator-access";
import { actOnComment, actOnPost, listQueue, listReports, resolveReport } from "@/server/community/moderation";
import { approveSubmission, getSubmissionImage, listSubmissions, rejectSubmission } from "@/server/community/review";
import { hideSensitive, myHistory, restrictMember, revokeRestriction, warnMember } from "@/server/community/discipline";
import { DealError } from "@/server/deals/service";
import { json } from "@/server/http";
import { getDatabase } from "@/server/db/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Community moderator API. Every call passes moderator access first (an active moderator account bound to its customer, with an appointment in force),
 * then each service checks its own specific capability. Administrators and other staff roles are refused here; they use the admin endpoints.
 *
 * GET  queue | reports | submissions[?status=] | submissions/{id}/image | history | me
 * POST posts/{id}/{approve|remove|restore|lock|unlock} | comments/{id}/{remove|restore} | reports/{id}/resolve
 *      submissions/{id}/{approve|reject} | members/{handle}/{warn|restrict} | restrictions/{id}/revoke | sensitive
 */
async function handle(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return moderatorApi(request, async ({ actor, appointment }) => {
    const [resource, id, action] = (await params).path;
    const search = new URL(request.url).searchParams;
    const page = z.coerce.number().int().min(1).max(10_000).parse(search.get("page") ?? 1);
    if (request.method === "GET") {
      if (resource === "me") return json({ data: appointment });
      if (resource === "queue") return json({ data: await listQueue(actor, page) });
      if (resource === "reports") return json({ data: await listReports(actor, z.enum(["OPEN", "RESOLVED", "DISMISSED", "ESCALATED"]).parse(search.get("status") ?? "OPEN"), page) });
      // Names only, for the approve-into-draft form. Moderators cannot create or edit categories or merchants.
      if (resource === "catalog") {
        const db = getDatabase();
        const [categories, merchants] = await Promise.all([db.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }), db.merchant.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })]);
        return json({ data: { categories, merchants } });
      }
      if (resource === "history") return json({ data: await myHistory(actor) });
      if (resource === "submissions" && !id) return json({ data: await listSubmissions(actor, z.enum(["PENDING_REVIEW", "APPROVED", "REJECTED"]).parse(search.get("status") ?? "PENDING_REVIEW"), page) });
      if (resource === "submissions" && id && action === "image") {
        const { bytes, mimeType } = await getSubmissionImage(actor, id, Math.min(9, Math.max(0, Number(new URL(request.url).searchParams.get("n")) || 0)));
        return new Response(new Uint8Array(bytes), { headers: { "Content-Type": mimeType, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" } });
      }
    }
    if (request.method === "POST") {
      const body = await readJson(request);
      if (resource === "posts" && id) return json({ data: await actOnPost(actor, id, z.enum(["approve", "remove", "restore", "lock", "unlock"]).parse(action), body) });
      if (resource === "comments" && id) return json({ data: await actOnComment(actor, id, z.enum(["remove", "restore"]).parse(action), body) });
      if (resource === "reports" && id && action === "resolve") return json({ data: await resolveReport(actor, id, body) });
      if (resource === "submissions" && id && action === "approve") return json({ data: await approveSubmission(actor, id, body) });
      if (resource === "submissions" && id && action === "reject") return json({ data: await rejectSubmission(actor, id, body) });
      if (resource === "members" && id && action === "warn") return json({ data: await warnMember(actor, id, body) }, 201);
      if (resource === "members" && id && action === "restrict") return json({ data: await restrictMember(actor, id, body) }, 201);
      if (resource === "restrictions" && id && action === "revoke") return json({ data: await revokeRestriction(actor, id, body) });
      if (resource === "sensitive" && !id) return json({ data: await hideSensitive(actor, body) }, 201);
    }
    throw new DealError("Not found.", 404);
  });
}
export { handle as GET, handle as POST };
