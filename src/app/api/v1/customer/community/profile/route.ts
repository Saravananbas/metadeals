import { communityWrite, json, readJson } from "@/server/community/http";
import { getOwnMemberProfile, updateMemberProfile } from "@/server/community/profile";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** The signed-in member's own public details (user name, display name, bio, city/state, picture). */
export const GET = (request: Request) => communityWrite(request, async (customerId) => json({ data: await getOwnMemberProfile(customerId) }));
export const PATCH = (request: Request) => communityWrite(request, async (customerId) => json({ data: await updateMemberProfile(customerId, await readJson(request)) }));
