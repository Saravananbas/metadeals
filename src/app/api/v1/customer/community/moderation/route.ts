import { readJson } from "@/server/auth/request";
import { customerApi, customerJson } from "@/server/customer/http";
import { fileAppeal, myModeration } from "@/server/community/discipline";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** The signed-in member's own warnings, restrictions, removals and appeals. Moderator identities are never included. */
export const GET = (request: Request) => customerApi(request, async (customerId) => customerJson({ data: await myModeration(customerId) }));
/** File an appeal: { targetType: "RESTRICTION" | "WARNING" | "ACTION", targetId, message }. */
export const POST = (request: Request) => customerApi(request, async (customerId) => customerJson({ data: await fileAppeal(customerId, await readJson(request)) }, 201));
