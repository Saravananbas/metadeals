import { z } from "zod";
import { communityWrite, json, readJson } from "@/server/community/http";
import { markNotificationsRead } from "@/server/community/notifications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({ ids: z.array(z.string().min(1).max(40)).max(100).optional() }).strict();

/** Marks the given notices (or all of them when no ids are sent) as read. */
export const POST = (request: Request) => communityWrite(request, async (customerId) => json({ data: await markNotificationsRead(customerId, bodySchema.parse(await readJson(request, 4_096).catch(() => ({}))).ids) }));
