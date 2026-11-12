import "server-only";
import { getServerSession } from "next-auth";
import { readJson } from "@/server/auth/request";
import { customerApi, customerErrorResponse, customerJson } from "@/server/customer/http";
import { getCustomerAuthOptions } from "@/server/customer/options";
import { assertCommunityEnabled, throttleRead } from "./config";

export { customerJson as json, readJson };

/** Public read: community switch, per-address throttle, optional session (anonymous visitors are fine). */
export async function communityRead(request: Request, run: (customerId: string | null) => Promise<Response>): Promise<Response> {
  try {
    assertCommunityEnabled();
    throttleRead(request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown");
    let customerId: string | null = null;
    try { customerId = (await getServerSession(getCustomerAuthOptions()))?.user?.id ?? null; } catch { customerId = null; }
    const response = await run(customerId);
    response.headers.set("Cache-Control", customerId ? "private, no-store" : "public, max-age=15, stale-while-revalidate=30");
    return response;
  } catch (error) {
    return customerErrorResponse(error);
  }
}

/** Signed-in write: same-origin check, session customer, uniform errors. The service layer adds the verified/active/suspended checks. */
export const communityWrite = customerApi;
