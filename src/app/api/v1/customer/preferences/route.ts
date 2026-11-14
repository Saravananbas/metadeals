import { readJson } from "@/server/auth/request";
import { customerApi, customerJson } from "@/server/customer/http";
import { getPreferences, updatePreferences } from "@/server/customer/dashboard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = (request: Request) => customerApi(request, async (customerId) => customerJson({ data: await getPreferences(customerId) }));
export const PATCH = (request: Request) => customerApi(request, async (customerId) => customerJson({ data: await updatePreferences(customerId, await readJson(request)) }));
