import { z } from "zod";
import { adminApi } from "@/server/community/admin-http";
import { listQueue } from "@/server/community/moderation";
import { json } from "@/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = (request: Request) =>
  adminApi(request, async (actor) => json({ data: await listQueue(actor, z.coerce.number().int().min(1).max(10_000).parse(new URL(request.url).searchParams.get("page") ?? 1)) }));
