import { communityWrite, json, readJson } from "@/server/community/http";
import { createPost } from "@/server/community/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = (request: Request) =>
  communityWrite(request, async (customerId) => json({ data: await createPost(customerId, await readJson(request, 32_768)) }, 201));
