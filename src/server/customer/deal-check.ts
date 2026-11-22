import "server-only";
import { z } from "zod";
import { getDatabase } from "@/server/db/client";
import { buildSearchFilter, dealInclude, listPublicDeals, publicWhere, searchGroups } from "@/server/deals/repository";
import { listingSchema } from "@/features/deals/validation";
import { dealIdsByUrlFragmentMariaDb, searchDealIdsMariaDb, usesMariaDb } from "@/server/community/like-search";
import { limitCustomerRequests } from "./service";
import { assertActiveCustomer } from "./session";
import { canonicalProductUrl, hashProductUrl } from "./submissions";

/**
 * The part of a store link that identifies the product, so two links with different tracking text still match.
 * Amazon: /dp/<ASIN>. Flipkart: ?pid=. Any other store: the product page path (for example /products/plum-lip-balm), ignoring the query and any tracking text.
 * shortcut: paths that are short or look like search and category pages give no key, to avoid false matches; a store that puts the product only in the query is not matched.
 */
export function productKey(raw: string): string | null {
  try {
    const url = new URL(raw);
    const asin = /\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:[/?]|$)/i.exec(url.pathname)?.[1];
    if (asin) return `/${asin.toUpperCase()}`;
    const pid = url.searchParams.get("pid");
    if (pid && /^[A-Z0-9]{8,20}$/i.test(pid)) return `pid=${pid}`;
    const path = decodeURIComponent(url.pathname).toLowerCase().replace(/\/+$/, "");
    if (path.length >= 15 && !/^\/(search|s|c|category|categories|collections?|cart|checkout|login)(\/|$)/.test(path) && !/[%_\\]/.test(path)) return path;
  } catch { /* not a link */ }
  return null;
}

export const dealCheckQuery = z.object({ url: z.string().trim().max(2048).optional(), title: z.string().trim().max(200).optional(), excludeDealId: z.string().max(100).optional() }).strict();
export type CheckState = "LIVE" | "EXPIRED" | "DRAFT" | "PENDING" | "ARCHIVED";
export type CheckItem = { slug: string; title: string; priceMinor: number; store: string; state: CheckState; postedAt: string | null };

const stateOf = (status: string): CheckState => (status === "EXPIRED" ? "EXPIRED" : status === "DRAFT" ? "DRAFT" : status === "ARCHIVED" ? "ARCHIVED" : status.startsWith("PENDING") ? "PENDING" : "LIVE");
type Row = { slug: string; title: string; priceMinor: number; merchant: { name: string }; status: string; publishedAt: Date | string | null; createdAt?: Date };
const toItem = (d: Row): CheckItem => ({ slug: d.slug, title: d.title, priceMinor: d.priceMinor, store: d.merchant.name, state: stateOf(d.status), postedAt: d.publishedAt ? new Date(d.publishedAt).toISOString() : d.createdAt?.toISOString() ?? null });

/** First four meaningful words of the title (brand and model come first). shortcut: a smarter text match can replace this when titles get long. */
const titleWords = (title?: string) => (title ?? "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length >= 3).slice(0, 4).join(" ");

/**
 * Deals that already use this product link, whether someone already sent it for review, and deals with a similar title.
 * Members only see deals the public can see; staff also see drafts, pending and archived ones (a repeated draft is the usual staff mistake),
 * and the deal being edited is left out.
 */
export async function findDealMatches(input: z.infer<typeof dealCheckQuery>, staff: boolean) {
  const db = getDatabase();
  const seen = new Set<string>(input.excludeDealId ? [input.excludeDealId] : []);
  const visible = staff ? {} : publicWhere(listingSchema.parse({}));
  const sameLink: CheckItem[] = [];
  let pending = false;

  if (input.url && /^https:\/\//i.test(input.url)) {
    const key = productKey(input.url);
    if (key) {
      const ids = usesMariaDb() ? await dealIdsByUrlFragmentMariaDb(key) : (await db.deal.findMany({ where: { OR: [{ productUrl: { contains: key } }, { affiliateUrl: { contains: key } }] }, select: { id: true }, take: 20 })).map((d) => d.id);
      const wanted = ids.filter((id) => id !== input.excludeDealId);
      if (wanted.length) {
        const rows = await db.deal.findMany({ where: { AND: [{ id: { in: wanted } }, visible] }, include: dealInclude, take: 5 });
        for (const r of rows) { seen.add(r.id); sameLink.push(toItem(r)); }
      }
    }
    try {
      const hash = hashProductUrl(canonicalProductUrl(input.url));
      pending = Boolean(await db.communityDealSubmission.findFirst({ where: { urlHash: hash, status: "PENDING_REVIEW" }, select: { id: true } }));
    } catch { /* an unreadable link has nothing to compare */ }
  }

  const similar: CheckItem[] = [];
  const words = titleWords(input.title);
  if (words.length >= 3) {
    if (staff) {
      const groups = usesMariaDb() ? searchGroups(words) : [];
      const where = groups.length ? { id: { in: await searchDealIdsMariaDb(groups) } } : buildSearchFilter(words);
      const rows = await db.deal.findMany({ where: { AND: [where, { id: { notIn: [...seen] } }] }, include: dealInclude, orderBy: { updatedAt: "desc" }, take: 8 });
      for (const r of rows) similar.push(toItem(r));
    } else {
      const found = await listPublicDeals(db, listingSchema.parse({ q: words, limit: 8 }));
      for (const d of found.data) if (!seen.has(d.id)) similar.push(toItem(d));
    }
  }
  return { sameLink, pending, similar: similar.slice(0, 8) };
}

/** Before a member posts a deal. Signed in, rate limited, and limited to what the public can already see. */
export async function dealCheck(customerId: string, raw: unknown) {
  const customer = await assertActiveCustomer(customerId);
  await limitCustomerRequests(`deal-check:${customer.id}`, 300, 3600);
  return findDealMatches(dealCheckQuery.omit({ excludeDealId: true }).parse(raw), false);
}
