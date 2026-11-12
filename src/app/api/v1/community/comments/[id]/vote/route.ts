import { communityWrite, json, readJson } from "@/server/community/http";
import { clearCommentVote, voteComment } from "@/server/community/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };
export const PUT = (request: Request, { params }: Context) => communityWrite(request, async (customerId) => json({ data: await voteComment(customerId, (await params).id, await readJson(request)) }));
export const DELETE = (request: Request, { params }: Context) => communityWrite(request, async (customerId) => json({ data: await clearCommentVote(customerId, (await params).id) }));
