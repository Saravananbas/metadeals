import { readJson } from "@/server/auth/request";
import { customerApi, customerJson } from "@/server/customer/http";
import { getThread, removeThread, updateThread } from "@/server/messages/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };
export const GET = (request: Request, { params }: Ctx) => customerApi(request, async (customerId) =>
  customerJson({ data: await getThread(customerId, (await params).id, new URL(request.url).searchParams.get("before")) }));
/** { muted?, archived? } for the signed-in member's own view of the conversation. */
export const PATCH = (request: Request, { params }: Ctx) => customerApi(request, async (customerId) => customerJson({ data: await updateThread(customerId, (await params).id, await readJson(request)) }));
/** Removes the conversation from the signed-in member's inbox only. */
export const DELETE = (request: Request, { params }: Ctx) => customerApi(request, async (customerId) => customerJson({ data: await removeThread(customerId, (await params).id) }));
