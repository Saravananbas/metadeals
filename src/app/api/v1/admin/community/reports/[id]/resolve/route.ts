import { readJson } from "@/server/auth/request";
import { adminApi } from "@/server/community/admin-http";
import { resolveReport } from "@/server/community/moderation";
import { json } from "@/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = (request: Request, { params }: { params: Promise<{ id: string }> }) =>
  adminApi(request, async (actor) => json({ data: await resolveReport(actor, (await params).id, await readJson(request)) }));
