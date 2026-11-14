import { customerApi, customerJson } from "@/server/customer/http";
import { getDashboard } from "@/server/customer/dashboard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Everything the profile page needs about the signed-in member (and only them). */
export const GET = (request: Request) => customerApi(request, async (customerId) => customerJson({ data: await getDashboard(customerId) }));
