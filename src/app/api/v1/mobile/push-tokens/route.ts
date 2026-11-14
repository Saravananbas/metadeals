import { readJson } from "@/server/auth/request";
import { customerApi, customerJson } from "@/server/customer/http";
import { registerPushToken, unregisterPushToken } from "@/server/push/dispatch";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Register this phone for push alerts: { token, platform: "ios" | "android", device? }. */
export const POST = (request: Request) => customerApi(request, async (customerId) => customerJson({ data: await registerPushToken(customerId, ((await readJson(request)) ?? {}) as Record<string, unknown>) }, 201));
/** Stop alerts for this phone: { token }. */
export const DELETE = (request: Request) => customerApi(request, async (customerId) => customerJson({ data: await unregisterPushToken(customerId, String(((await readJson(request)) as { token?: unknown } | null)?.token ?? "")) }));
