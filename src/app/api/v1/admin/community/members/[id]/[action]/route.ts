import { z } from "zod";
import { readJson } from "@/server/auth/request";
import { adminApi } from "@/server/community/admin-http";
import { setMemberStatus, setMemberVerified } from "@/server/community/moderation";
import { json } from "@/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = (request: Request, { params }: { params: Promise<{ id: string; action: string }> }) =>
  adminApi(request, async (actor) => {
    const { id, action } = await params;
    const what = z.enum(["suspend", "restore", "verify", "unverify"]).parse(action);
    const body = await readJson(request);
    return json({ data: what === "verify" || what === "unverify" ? await setMemberVerified(actor, id, what === "verify", body) : await setMemberStatus(actor, id, what, body) });
  });
