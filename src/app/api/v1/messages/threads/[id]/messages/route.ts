import { readJson } from "@/server/auth/request";
import { customerApi, customerJson } from "@/server/customer/http";
import { sendMessage } from "@/server/messages/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = (request: Request, { params }: { params: Promise<{ id: string }> }) => customerApi(request, async (customerId) =>
  customerJson({ data: await sendMessage(customerId, (await params).id, await readJson(request)) }, 201));
