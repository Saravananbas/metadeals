import { communityRead, communityWrite, json, readJson } from "@/server/community/http";
import { deletePost, editPost, getPost } from "@/server/community/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ ref: string }> };
export const GET = (request: Request, { params }: Context) => communityRead(request, async (customerId) => json({ data: await getPost((await params).ref, customerId) }));
export const PATCH = (request: Request, { params }: Context) =>
  communityWrite(request, async (customerId) => json({ data: await editPost(customerId, (await params).ref, await readJson(request, 32_768)) }));
export const DELETE = (request: Request, { params }: Context) => communityWrite(request, async (customerId) => json({ data: await deletePost(customerId, (await params).ref) }));
