# SEO deal URLs

## Address
`/deal/{primary-category-slug}/{product-slug}-{publicId}` for example `/deal/mobiles/samsung-galaxy-m35-5g-128gb-dk3m9x2ab`.

- **publicId**: `d` + 8 characters (`0-9a-z` without look-alikes), generated once per deal by `assignCanonicalPath`, unique (`Deal.publicId`). It never changes with title, category, price or store. Each retailer offer is its own deal row and gets its own id.
- **Category**: the *primary* (top-level) category of the deal's category, from the existing `Category` table (`primaryCategorySlug`). No hand-written map. A deal with no usable category gets **no** address (it is reported, not published under a guessed one).
- **Product slug**: `productSlug()` in `src/features/deals/seo-url.ts`, the only place addresses are built. Lower case ASCII, accents folded, `&`/`+`/`%` spelled out, repeated brand phrases collapsed, placeholder brands ignored, cut between words at about 90 characters, never empty.

## Data (migration `20261207000000_seo_deal_urls`, additive only)
- `Deal.publicId` (unique, nullable until backfilled), `Deal.canonicalPath` (unique).
- `DealUrlHistory(id, dealId, path unique, reason, redirectStatus, createdAt)`: every earlier address. `dealId` has no foreign key on purpose, so a deleted deal's addresses survive and answer 410.
- Both Prisma schemas and both migration folders are updated. Nothing is deleted or reset.

## Behaviour (`src/server/deals/seo-url-service.ts`)
- `assignCanonicalPath` is idempotent and race-safe: it changes the address with a compare-and-set on the value it read, and keeps the previous address of a deal that was ever public in history (same transaction). It is called from `saveDeal` (admin and member submissions), scraper publishing and category deletion.
- `resolveDealAddress`: identity is always the deal's own record (public id, database id, or old slug), never similar words. Unknown address: 404. Deleted deal: 410. Not public (draft/archived): 404.
- `/deal/{slug}` (old addresses, database-id form): permanent **301** straight to the current address (query string kept). Route: `src/app/deal/[slug]/route.ts`.
- `/deal/{category}/{words}-{id}` with a stale category or words: permanent redirect (**308**, which search engines treat as 301) straight to the current address. Next.js pages cannot send a literal 301; a route handler can, which is why old single-part addresses use one.
- No redirect chains: the history stores no target; the target is the current address at request time. Going back to an earlier category makes that address canonical again (no loop).
- Short links `/d/{code}` go to the canonical address. `/go/{dealId}` (affiliate redirect) and the retailer URLs are untouched.
- `src/app/deal/[slug]/loading.tsx` was removed: a streamed loading shell sends status 200 before the page can decide, which turned redirects and not-found pages into 200 "soft" answers.

## Pages
Server-rendered title (`{title} Deal – Latest Price | MetaDeals4U`), description (title, store, price, saving), canonical, Open Graph, Twitter card, robots. JSON-LD: Product + Offer (INR, price, `OutOfStock` for expired deals, `priceValidUntil` from the expiry date) + BreadcrumbList; WebPage for travel and sale-page deals; rating markup only with a real review count.
Sitemap: canonical addresses only (published, not expired), `lastmod` from the deal's update time, up to 45,000 entries.

## Migration
1. Review: `node --env-file=.env --conditions=react-server --import tsx scripts/seo/url-report.mts [--list]` (read only).
2. Apply the migration SQL (owner, phpMyAdmin, plus the `_prisma_migrations` row).
3. Backfill: `scripts/seo/backfill-deal-urls.mts` (dry run by default, `--apply` to write; safe to repeat). Until the backfill has run, a deal gets its address on its first visit, and is left out of the sitemap until then.

## Not changed (still redirect through the old address)
Profile, community activity, scraper dashboard and mobile-app deep links still build `/deal/{slug}`; they work through the 301. Switch them to `dealHref()` when convenient.
