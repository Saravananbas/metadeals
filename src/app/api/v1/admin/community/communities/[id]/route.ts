import { readJson } from "@/server/auth/request";
import { adminApi } from "@/server/community/admin-http";
import { saveCommunity } from "@/server/community/moderation";
import { json } from "@/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const PATCH = (request: Request, { params }: { params: Promise<{ id: string }> }) =>
  adminApi(request, async (actor) => json({ data: await saveCommunity(actor, await readJson(request), (await params).id) }));
