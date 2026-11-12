import { readJson } from "@/server/auth/request";
import { customerApi, customerJson } from "@/server/customer/http";
import { getProfile, updateProfile } from "@/server/customer/profile";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = (request: Request) => customerApi(request, async (customerId) => customerJson({ data: await getProfile(customerId) }));

export const PATCH = (request: Request) =>
  customerApi(request, async (customerId) => customerJson({ data: await updateProfile(customerId, await readJson(request)) }));
