import { communityWrite, json } from "@/server/community/http";
import { getActivity } from "@/server/community/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = (request: Request) => communityWrite(request, async (customerId) => json({ data: await getActivity(customerId) }));
