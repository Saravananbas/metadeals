import { readJson } from "@/server/auth/request";
import { customerApi, customerJson } from "@/server/customer/http";
import { getIdentity, setUserName } from "@/server/customer/identity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = (request: Request) => customerApi(request, async (customerId) => customerJson({ data: await getIdentity(customerId) }));
export const PATCH = (request: Request) => customerApi(request, async (customerId) => customerJson({ data: await setUserName(customerId, await readJson(request)) }));
