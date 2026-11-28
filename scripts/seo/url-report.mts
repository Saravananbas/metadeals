// READ-ONLY report for the SEO address migration. Changes nothing. Prints counts and the proposed canonical address per deal.
// Run: node --conditions=react-server --import tsx scripts/seo/url-report.mts [--list]
import { getDatabase } from "../../src/server/db/client";
import { canonicalPath, primaryCategorySlug, productSlug, type CategoryLike } from "../../src/features/deals/seo-url";

const db = getDatabase();
const deals = await db.deal.findMany({ select: { id: true, slug: true, title: true, brand: true, categoryId: true, status: true } });
const cats = new Map<string, CategoryLike>((await db.category.findMany({ select: { id: true, slug: true, parentId: true } })).map((c) => [c.id, c]));

const seen = new Map<string, string[]>();
const missingCategory: string[] = [], invalidTitle: string[] = [], proposed: { id: string; from: string; to: string }[] = [];
for (const d of deals) {
  const category = primaryCategorySlug(cats, d.categoryId);
  if (!category) missingCategory.push(d.id);
  if (!d.title?.trim() || productSlug(d.title, d.brand) === "deal") invalidTitle.push(d.id);
  const key = `${category}/${productSlug(d.title, d.brand)}`;
  seen.set(key, [...(seen.get(key) ?? []), d.id]);
  const to = canonicalPath({ categorySlug: category, title: d.title, brand: d.brand, publicId: "dxxxxxxxx" });
  if (to) proposed.push({ id: d.id, from: `/deal/${d.slug}`, to: to.replace("dxxxxxxxx", "d<publicId>") });
}
const duplicates = [...seen.entries()].filter(([, ids]) => ids.length > 1);
const slugCount = new Set(deals.map((d) => d.slug)).size;
console.log(JSON.stringify({
  totalDeals: deals.length,
  byStatus: Object.fromEntries([...new Set(deals.map((d) => d.status))].map((s) => [s, deals.filter((d) => d.status === s).length])),
  existingUrls: slugCount,
  dealsMissingPrimaryCategory: missingCategory.length,
  dealsWithInvalidTitle: invalidTitle.length,
  duplicateAddressCandidates: duplicates.length + " groups (resolved by the unique deal id, not merged)",
  unresolvableExistingUrls: missingCategory.length + " (will keep the old address and be flagged; not migrated)",
  proposedCanonical: proposed.length,
}, null, 2));
if (process.argv.includes("--list")) for (const p of proposed) console.log(`${p.from}  ->  ${p.to}`);
await db.$disconnect();
