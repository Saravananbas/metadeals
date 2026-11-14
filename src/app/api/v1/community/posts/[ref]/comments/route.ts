import { communityRead, communityWrite, json, readJson } from "@/server/community/http";
import { COMMENT_SORTS, createComment, listComments, type CommentSort } from "@/server/community/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ ref: string }> };
export const GET = (request: Request, { params }: Context) =>
  communityRead(request, async (customerId) => json({ data: await listComments((await params).ref, new URL(request.url).searchParams.get("cursor") ?? undefined, customerId, COMMENT_SORTS.find((x) => x === new URL(request.url).searchParams.get("sort")) as CommentSort | undefined) }));
export const POST = (request: Request, { params }: Context) =>
  communityWrite(request, async (customerId) => json({ data: await createComment(customerId, (await params).ref, await readJson(request, 16_384)) }, 201));
