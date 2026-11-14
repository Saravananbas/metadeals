import { readJson } from "@/server/community/http";
import { communityWrite, json } from "@/server/community/http";
import { deleteDraft, getDraft, saveDraft } from "@/server/community/composer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// A draft belongs to the signed-in member only: every call reads the member from the session, never from the request.
export const GET = (request: Request) => communityWrite(request, async (customerId) => json({ data: await getDraft(customerId) }));
export const PUT = (request: Request) => communityWrite(request, async (customerId) => json({ data: await saveDraft(customerId, await readJson(request)) }));
export const DELETE = (request: Request) => communityWrite(request, async (customerId) => json({ data: await deleteDraft(customerId) }));
