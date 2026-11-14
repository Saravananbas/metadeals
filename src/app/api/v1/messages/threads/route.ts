import { readJson } from "@/server/auth/request";
import { customerApi, customerJson } from "@/server/customer/http";
import { listThreads, startThread } from "@/server/messages/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The member always comes from the session or app token, never from the request body.
export const GET = (request: Request) => customerApi(request, async (customerId) => {
  const sp = new URL(request.url).searchParams;
  return customerJson({ data: await listThreads(customerId, { filter: sp.get("filter"), q: sp.get("q") }) });
});
/** First message to a member: { handle, body?, share?, clientId? }. Creates the conversation if the two members have none. */
export const POST = (request: Request) => customerApi(request, async (customerId) => customerJson({ data: await startThread(customerId, await readJson(request)) }, 201));
