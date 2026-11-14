import { adminApi } from "@/server/community/admin-http";
import { createAnnouncement, listAnnouncementsAdmin } from "@/server/community/announcements";
import { readJson } from "@/server/auth/request";
import { json } from "@/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Staff sign-in is the existing staff authentication; the permission is checked again inside every action.
export const GET = (request: Request) => adminApi(request, async (actor) => json({ data: await listAnnouncementsAdmin(actor) }));
export const POST = (request: Request) => adminApi(request, async (actor) => json({ data: await createAnnouncement(actor, await readJson(request, 90_000)) }, 201));
