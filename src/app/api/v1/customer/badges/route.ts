import { customerApi, customerJson } from "@/server/customer/http";
import { getBadgeBoard } from "@/server/badges/counts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** The signed-in member's badges: every category with its tiers, how far they are and what comes next (the website and the apps use the same answer). */
export const GET = (request: Request) => customerApi(request, async (customerId) => customerJson({ data: await getBadgeBoard(customerId) }));
