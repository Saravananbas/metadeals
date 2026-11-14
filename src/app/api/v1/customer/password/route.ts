import { readJson } from "@/server/auth/request";
import { customerApi, customerJson } from "@/server/customer/http";
import { changePassword } from "@/server/customer/dashboard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = (request: Request) => customerApi(request, async (customerId) => customerJson({ data: await changePassword(customerId, await readJson(request)) }));
