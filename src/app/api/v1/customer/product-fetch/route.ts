import { readJson } from "@/server/auth/request";
import { customerApi, customerJson } from "@/server/customer/http";
import { fetchProductDetails } from "@/server/customer/product-fetch";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export const POST = (request: Request) =>
  customerApi(request, async (customerId) => customerJson({ data: await fetchProductDetails(customerId, await readJson(request)) }));
