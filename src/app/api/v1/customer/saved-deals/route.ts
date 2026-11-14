import { readJson } from "@/server/auth/request";
import { customerApi, customerJson } from "@/server/customer/http";
import { listSavedDeals, removeSavedDeal, saveDeal } from "@/server/customer/dashboard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = (request: Request) => customerApi(request, async (customerId) => customerJson({ data: await listSavedDeals(customerId) }));
export const POST = (request: Request) => customerApi(request, async (customerId) => customerJson({ data: await saveDeal(customerId, await readJson(request)) }));
export const DELETE = (request: Request) => customerApi(request, async (customerId) => customerJson({ data: await removeSavedDeal(customerId, await readJson(request)) }));
