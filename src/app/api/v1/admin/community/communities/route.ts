import { readJson } from "@/server/auth/request";
import { adminApi } from "@/server/community/admin-http";
import { listCommunitiesAdmin, saveCommunity } from "@/server/community/moderation";
import { json } from "@/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = (request: Request) => adminApi(request, async (actor) => json({ data: await listCommunitiesAdmin(actor) }));
export const POST = (request: Request) => adminApi(request, async (actor) => json({ data: await saveCommunity(actor, await readJson(request)) }, 201));
