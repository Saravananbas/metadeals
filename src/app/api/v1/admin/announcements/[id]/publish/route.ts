import { z } from "zod";
import { adminApi } from "@/server/community/admin-http";
import { publishAnnouncement, unpublishAnnouncement } from "@/server/community/announcements";
import { readJson } from "@/server/auth/request";
import { json } from "@/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({ action: z.enum(["publish", "unpublish"]) }).strict();
export const POST = (request: Request, { params }: { params: Promise<{ id: string }> }) =>
  adminApi(request, async (actor) => {
    const { action } = bodySchema.parse(await readJson(request, 1_024));
    const id = (await params).id;
    return json({ data: action === "publish" ? await publishAnnouncement(actor, id) : await unpublishAnnouncement(actor, id) });
  });
