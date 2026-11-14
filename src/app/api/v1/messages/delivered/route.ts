import { customerApi, customerJson } from "@/server/customer/http";
import { markDelivered } from "@/server/messages/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = (request: Request) => customerApi(request, async (customerId) => customerJson({ data: await markDelivered(customerId) }));
