import { communityWrite, json, readJson } from "@/server/community/http";
import { reportContent } from "@/server/community/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = (request: Request) => communityWrite(request, async (customerId) => json({ data: await reportContent(customerId, await readJson(request)) }, 201));
