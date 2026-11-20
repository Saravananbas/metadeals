import "server-only";
import { z } from "zod";
import { getDatabase } from "@/server/db/client";
import { dealInclude, listPublicDeals, publicWhere } from "@/server/deals/repository";
import { listingSchema } from "@/features/deals/validation";
import { dealIdsByUrlFragmentMariaDb, usesMariaDb } from "@/server/community/like-search";
import { limitCustomerRequests } from "./service";
import { assertActiveCustomer } from "./session";
import { canonicalProductUrl, hashProductUrl } from "./submissions";

/** The part of a store link that identifies the product, so two links with different tracking text still match. Amazon: /dp/<ASIN>. Flipkart: ?pid=. Otherwise null. */
export function productKey(raw: string): string | null {
  try {
    const url = new URL(raw);
    const asin = /\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:[/?]|$)/i.exec(url.pathname)?.[1];
    if (asin) return `/${asin.toUpperCase()}`;
    const pid = url.searchParams.get("pid");
    if (pid && /^[A-Z0-9]{8,20}$/i.test(pid)) return `pid=${pid}`;
  } catch { /* not a link */ }
  return null;
}

const querySchema = z.object({ url: z.string().trim().max(2048).optional(), title: z.string().trim().max(200).optional() }).strict();
type Item = { slug: string; title: string; priceMinor: number; store: string; state: "LIVE" | "EXPIRED"; postedAt: string | null };
const toItem = (d: { slug: string; title: string; priceMinor: number; merchant: { name: string }; status: string; publishedAt: string | null }): Item => ({ slug: d.slug, title: d.title, priceMinor: d.priceMinor, store: d.merchant.name, state: d.status === "EXPIRED" ? "EXPIRED" : "LIVE", postedAt: d.publishedAt });

/** Before posting: deals that already use this product link, whether someone already sent it for review, and deals with a similar title (live and expired). Public facts only. */
export async function dealCheck(customerId: string, raw: unknown) {
  const customer = await assertActiveCustomer(customerId);
  await limitCustomerRequests(`deal-check:${customer.id}`, 300, 3600);
  const input = querySchema.parse(raw);
  const db = getDatabase();
  const seen = new Set<string>();
  const sameLink: Item[] = [];
  let pending = false;

  if (input.url && /^https:\/\//i.test(input.url)) {
    const key = productKey(input.url);
    if (key) {
      const ids = usesMariaDb() ? await dealIdsByUrlFragmentMariaDb(key) : (await db.deal.findMany({ where: { OR: [{ productUrl: { contains: key } }, { affiliateUrl: { contains: key } }] }, select: { id: true }, take: 20 })).map((d) => d.id);
      if (ids.length) {
        const rows = await db.deal.findMany({ where: { AND: [{ id: { in: ids } }, publicWhere(listingSchema.parse({}))] }, include: dealInclude, take: 5 });
        for (const r of rows) { seen.add(r.id); sameLink.push(toItem({ slug: r.slug, title: r.title, priceMinor: r.priceMinor, merchant: r.merchant, status: r.status, publishedAt: r.publishedAt?.toISOString() ?? null })); }
      }
    }
    try {
      const hash = hashProductUrl(canonicalProductUrl(input.url));
      pending = Boolean(await db.communityDealSubmission.findFirst({ where: { urlHash: hash, status: "PENDING_REVIEW" }, select: { id: true } }));
    } catch { /* an unreadable link has nothing to compare */ }
  }

  const similar: Item[] = [];
  // shortcut: the first four meaningful words of the title (brand and model come first); a smarter text match can replace this when titles get long.
  const words = (input.title ?? "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length >= 3).slice(0, 4).join(" ");
  if (words.length >= 3) {
    const found = await listPublicDeals(db, listingSchema.parse({ q: words, limit: 8 }));
    for (const d of found.data) if (!seen.has(d.id)) similar.push(toItem({ slug: d.slug, title: d.title, priceMinor: d.priceMinor, merchant: d.merchant, status: d.status, publishedAt: d.publishedAt }));
  }
  return { sameLink, pending, similar: similar.slice(0, 8) };
}
