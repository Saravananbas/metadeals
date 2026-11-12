import { communityWrite, json, readJson } from "@/server/community/http";
import { updateOwnProfile } from "@/server/community/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const PATCH = (request: Request) => communityWrite(request, async (customerId) => json({ data: await updateOwnProfile(customerId, await readJson(request)) }));
