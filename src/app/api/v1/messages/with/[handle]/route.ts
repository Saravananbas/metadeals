import { customerApi, customerJson } from "@/server/customer/http";
import { openWith } from "@/server/messages/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = (request: Request, { params }: { params: Promise<{ handle: string }> }) => customerApi(request, async (customerId) =>
  customerJson({ data: await openWith(customerId, (await params).handle) }));
