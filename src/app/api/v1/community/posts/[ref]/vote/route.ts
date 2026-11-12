import { communityWrite, json, readJson } from "@/server/community/http";
import { clearPostVote, votePost } from "@/server/community/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ ref: string }> };
export const PUT = (request: Request, { params }: Context) => communityWrite(request, async (customerId) => json({ data: await votePost(customerId, (await params).ref, await readJson(request)) }));
export const DELETE = (request: Request, { params }: Context) => communityWrite(request, async (customerId) => json({ data: await clearPostVote(customerId, (await params).ref) }));
