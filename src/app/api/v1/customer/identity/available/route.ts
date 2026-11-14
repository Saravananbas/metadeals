import { customerApi, customerJson } from "@/server/customer/http";
import { userNameAvailability } from "@/server/community/profile";
import { limitCustomerRequests } from "@/server/customer/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = (request: Request) => customerApi(request, async (customerId) => {
  await limitCustomerRequests("username-check:" + customerId, 120, 3600);
  return customerJson({ data: await userNameAvailability(customerId, new URL(request.url).searchParams.get("handle") ?? "") });
});
