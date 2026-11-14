import { customerApi, customerJson } from "@/server/customer/http";
import { searchMembers } from "@/server/messages/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = (request: Request) => customerApi(request, async (customerId) =>
  customerJson({ data: await searchMembers(customerId, new URL(request.url).searchParams.get("q") ?? "") }));
