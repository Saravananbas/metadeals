import { customerApi, customerJson } from "@/server/customer/http";
import { searchMentions } from "@/server/deals/mentions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Suggestions for "@name" in a comment. Signed-in members only. */
export const GET = (request: Request) => customerApi(request, async (customerId) =>
  customerJson({ data: await searchMentions(customerId, new URL(request.url).searchParams.get("q") ?? "") }));
