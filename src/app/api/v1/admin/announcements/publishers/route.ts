import { z } from "zod";
import { adminApi } from "@/server/community/admin-http";
import { listPublishers, setPublisherGrant } from "@/server/community/announcements";
import { readJson } from "@/server/auth/request";
import { json } from "@/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({ userId: z.string().min(1).max(40), granted: z.boolean() }).strict();
// Super admins only (checked inside).
export const GET = (request: Request) => adminApi(request, async (actor) => json({ data: await listPublishers(actor) }));
export const PUT = (request: Request) => adminApi(request, async (actor) => { const b = bodySchema.parse(await readJson(request, 1_024)); return json({ data: await setPublisherGrant(actor, b.userId, b.granted) }); });
