import { customerApi, customerJson } from "@/server/customer/http";
import { setBlocked } from "@/server/messages/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ handle: string }> };
export const PUT = (request: Request, { params }: Ctx) => customerApi(request, async (customerId) => customerJson({ data: await setBlocked(customerId, (await params).handle, true) }));
export const DELETE = (request: Request, { params }: Ctx) => customerApi(request, async (customerId) => customerJson({ data: await setBlocked(customerId, (await params).handle, false) }));
