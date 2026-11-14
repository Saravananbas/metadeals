import { customerApi, customerJson } from "@/server/customer/http";
import { typing } from "@/server/messages/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = (request: Request, { params }: { params: Promise<{ id: string }> }) => customerApi(request, async (customerId) =>
  customerJson({ data: await typing(customerId, (await params).id) }));
