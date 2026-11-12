import { z } from "zod";
import { adminApi } from "@/server/community/admin-http";
import { listReports } from "@/server/community/moderation";
import { json } from "@/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = (request: Request) =>
  adminApi(request, async (actor) => {
    const params = new URL(request.url).searchParams;
    const status = z.enum(["OPEN", "RESOLVED", "DISMISSED", "ESCALATED"]).parse(params.get("status") ?? "OPEN");
    return json({ data: await listReports(actor, status, z.coerce.number().int().min(1).max(10_000).parse(params.get("page") ?? 1)) });
  });
