import { communityWrite, json, readJson } from "@/server/community/http";
import { deleteComment, editComment } from "@/server/community/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };
export const PATCH = (request: Request, { params }: Context) =>
  communityWrite(request, async (customerId) => json({ data: await editComment(customerId, (await params).id, await readJson(request, 16_384)) }));
export const DELETE = (request: Request, { params }: Context) => communityWrite(request, async (customerId) => json({ data: await deleteComment(customerId, (await params).id) }));
