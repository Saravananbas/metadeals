import { customerApi, customerJson } from "@/server/customer/http";
import { dealCheck } from "@/server/customer/deal-check";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Duplicate and similar-deal check for the Post a Deal form. Signed in members only. */
export const GET = (request: Request) => customerApi(request, async (customerId) => {
  const q = new URL(request.url).searchParams;
  return customerJson({ data: await dealCheck(customerId, { url: q.get("url") ?? undefined, title: q.get("title") ?? undefined }) });
});
