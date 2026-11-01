# M1 — Homepage implementation

## Scope

The owner's `goahead` approved M1 after M0. The existing new Next.js application was
extended; the old website was not accessed or reused. No backend business module,
database migration, external account integration or new npm dependency was added.

The approved layout is implemented: white header, purple hero with search and product
art, trending searches, horizontal categories, six desktop deal cards, three banners
and four benefits. Mobile uses compact navigation, horizontal categories and two
cards per row. Tablet uses three columns; medium desktop uses four before six fit.

## Components

All homepage components live under `src/features/home/components/`:
Header, HeroSection, TrendingSearches, CategorySection, DealCard, TopDealsSection,
FeaturedDeals, LatestDeals, PromotionalBanners, PopularStores, WhyMetaDeals, Footer,
StoreLogo and Dialog. Featured/latest are alternate deal-grid views selected from
navigation; popular stores are available in the Stores dialog. This preserves the
approved default layout without adding extra homepage sections.

## Functionality

- Product/brand search, case-insensitive and whitespace-normalized, with all query
  terms matched. Trending chips apply corresponding searches.
- Category/store filtering, result counts, clear filters and useful empty states.
- Featured selection and latest ordering of the sample collection.
- INR formatting, original/discounted prices and computed savings. Percentages are
  rounded down to avoid overstating discounts; therefore some differ from the mockup.
- Product previews and retailer search/listing links with an explicit demo disclosure.
- Saved deals in browser localStorage, including remove, count and empty states.
  This is not authenticated wishlisting or cross-device synchronization.
- Honest expiry indicators: demo expiry is unverified; no artificial countdown.
- Responsive navigation; native modal dialog focus/escape behavior; skip link,
  labeled inputs, pressed states, visible focus styles and reduced-motion styling.
- Optimized local Next Image assets, responsive sizes, hero preload and lazy product images.

## Data and image boundaries

`src/features/deals/service.ts` is the server data boundary. It returns the explicitly
separated demo fixtures from `demo-data.ts`; no deal schema or live API exists yet.
Search and filters run over these server-provided fixtures. This does not claim
database-driven live deals, real reviews or verified affiliate prices.

The hero and six product illustrations were created with the built-in image-generation
tool and saved under `public/images/`. Exact prompts and paths are in
[image-prompts.md](image-prompts.md). UI content remains semantic HTML, not a flattened
screenshot. The original reference remains unchanged.

The implementation is not pixel-identical: generated product artwork, the locally
drawn brand mark, retailer wordmarks and platform-rendered category emoji differ
from the supplied image. Demo disclosures add some height. Unsupported "verified"
and "daily updates" claims are replaced with neutral copy in the same visual slots.
Final brand/product assets and genuine offer data are needed before public launch.

## Files changed

Modified:
- `src/app/page.tsx` — server data loading and homepage composition.
- `src/app/globals.css` — reference-based responsive visual system.
- `scripts/smoke.mjs` — homepage/demo disclosure, seven assets and image optimization checks.
- `README.md` — current milestone and data limitations.

Created:
- `src/features/deals/{types,pricing,filter,demo-data,service}.ts`.
- `src/features/home/Homepage.tsx`, `catalog.ts`, `saved-store.ts`.
- The 15 reusable component files listed above.
- `tests/deals.test.ts`.
- `public/images/hero.png` and six `public/images/products/*.png` files.
- `docs/image-prompts.md`, this report and `docs/screenshots/m1-{desktop,tablet,mobile}.jpg`.

## Verification

- `npm run lint`: passed with zero warnings.
- `npm run typecheck`: passed.
- `npm test`: 13/13 passed, including discounts, invalid prices, search, combined
  filters, ordering and source immutability, plus existing foundation tests.
- `npm run build`: passed after final code changes.
- `npm run test:smoke`: passed against the production build: homepage, seven image
  assets, WebP image optimization, security headers, liveness/readiness, generic
  dependency-failure responses, 404 behavior and disabled authentication route.
- Browser testing at 1536×1024, 768×1024, 390×844 and 320×800. Checked six/three/two
  grid columns and no horizontal document overflow at these widths.
- Interactive browser checks: Sony brand search; category empty state/reset; saving
  and removing a demo deal; deal disclosure and retailer URL; Escape dismissal;
  mobile menu/category navigation; Flipkart filter (two results); featured (four
  results); latest ordering; Home resets filters; bank-offer unavailable message.
- All seven main images loaded successfully. No browser console warnings or errors
  were observed during those checks. Browser screenshots are retained for comparison.
- The already-running development server at http://localhost:3003 was reused and
  left running. Temporary production smoke-test servers stop automatically.

## Remaining work

Live deals/models/APIs, verified imagery/prices/ratings/expiry, authentication,
affiliate tracking, real promotions, alerts and full editorial content remain future
milestones. M0's documented development-tool audit findings remain unchanged.
No public deployment or claim of live offer verification has been made.
