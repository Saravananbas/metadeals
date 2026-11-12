import { z } from "zod";
import { readJson } from "@/server/auth/request";
import { adminApi } from "@/server/community/admin-http";
import { actOnPost } from "@/server/community/moderation";
import { json } from "@/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const actions = z.enum(["approve", "remove", "restore", "lock", "unlock"]);

export const POST = (request: Request, { params }: { params: Promise<{ id: string; action: string }> }) =>
  adminApi(request, async (actor) => {
    const { id, action } = await params;
    return json({ data: await actOnPost(actor, id, actions.parse(action), await readJson(request)) });
  });
