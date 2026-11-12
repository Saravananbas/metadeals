import { z } from "zod";
import { readJson } from "@/server/auth/request";
import { adminApi } from "@/server/community/admin-http";
import { actOnComment } from "@/server/community/moderation";
import { json } from "@/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = (request: Request, { params }: { params: Promise<{ id: string; action: string }> }) =>
  adminApi(request, async (actor) => {
    const { id, action } = await params;
    return json({ data: await actOnComment(actor, id, z.enum(["remove", "restore"]).parse(action), await readJson(request)) });
  });
