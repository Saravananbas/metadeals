import { adminApi } from "@/server/community/admin-http";
import { deleteAnnouncement, updateAnnouncement } from "@/server/community/announcements";
import { readJson } from "@/server/auth/request";
import { json } from "@/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };
export const PATCH = (request: Request, { params }: Context) => adminApi(request, async (actor) => json({ data: await updateAnnouncement(actor, (await params).id, await readJson(request, 90_000)) }));
export const DELETE = (request: Request, { params }: Context) => adminApi(request, async (actor) => json({ data: await deleteAnnouncement(actor, (await params).id) }));
