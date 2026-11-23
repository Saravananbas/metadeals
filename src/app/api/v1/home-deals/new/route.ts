import { z } from "zod";
import { getDatabase } from "@/server/db/client";
import { publicWhere } from "@/server/deals/repository";
import { listingSchema } from "@/features/deals/validation";
import { api } from "@/server/http";

export const dynamic = "force-dynamic";

/** How many public deals were published after `since` (the server time this page last saw). One small count; without `since` it only returns the clock to start from. */
export async function GET(request: Request) {
  return api(async () => {
    const now = new Date();
    const raw = new URL(request.url).searchParams.get("since");
    const body = (count: number) => Response.json({ count, now: now.toISOString() }, { headers: { "Cache-Control": "no-store" } });
    if (!raw) return body(0);
    const since = z.coerce.date().parse(raw);
    const count = await getDatabase().deal.count({ where: { AND: [publicWhere(listingSchema.parse({}), now), { publishedAt: { gt: since } }] } });
    return body(count);
  });
}
