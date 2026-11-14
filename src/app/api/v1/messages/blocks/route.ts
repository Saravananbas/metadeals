import { customerApi, customerJson } from "@/server/customer/http";
import { listBlocked } from "@/server/messages/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = (request: Request) => customerApi(request, async (customerId) => customerJson({ data: await listBlocked(customerId) }));
