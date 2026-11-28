// Gives every existing deal its permanent public id and canonical address, and remembers its original /deal/{slug} address.
// Idempotent: running it again changes nothing. Deals without a usable primary category are NOT migrated; they are listed.
// Dry run by default. Run: node --env-file=.env --conditions=react-server --import tsx scripts/seo/backfill-deal-urls.mts [--apply]
import { getDatabase } from "../../src/server/db/client";
import { assignCanonicalPath, loadCategoryMap, rememberLegacyPath } from "../../src/server/deals/seo-url-service";

const apply = process.argv.includes("--apply");
const db = getDatabase();
const categories = await loadCategoryMap(db);
const deals = await db.deal.findMany({ select: { id: true, slug: true, canonicalPath: true, publicId: true, status: true, everPublished: true } });
const summary = { total: deals.length, alreadyDone: 0, migrated: 0, legacyRemembered: 0, unresolved: [] as string[] };
for (const deal of deals) {
  if (deal.canonicalPath && deal.publicId) { summary.alreadyDone++; } else if (apply) {
    const result = await assignCanonicalPath(db, deal.id, categories);
    if (result.skipped) summary.unresolved.push(deal.id); else summary.migrated++;
  } else summary.migrated++;
  const wasPublic = deal.everPublished || deal.status === "PUBLISHED" || deal.status === "EXPIRED";
  if (apply && wasPublic) { await rememberLegacyPath(db, deal.id, deal.slug); summary.legacyRemembered++; }
}
console.log(JSON.stringify({ mode: apply ? "APPLIED" : "DRY RUN (nothing written)", ...summary, unresolved: summary.unresolved.length ? summary.unresolved : "none" }, null, 2));
await db.$disconnect();
