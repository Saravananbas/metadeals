# MetaDeals4U performance plan

Prepared 16 November 2026 from measurements. No performance changes have been made yet.

## What was measured

| Where | What | Result |
|---|---|---|
| Staging (Hostinger), from here, 3 runs | Homepage HTML | 0.11 to 0.20 s to first byte, 164 KB |
| | `/api/v1/deals`, `/home-deals`, `/catalog` | 0.09 to 0.30 s |
| | Deal page | 0.22 to 0.33 s, but **one run took 1.36 s** |
| | A deal image | 0.10 s, 33 KB |
| Local `npm run dev` | First visit to a route | **2 to 4 s** (the media route 3.6 s, `/api/auth/providers` 2.8 s, `/` 2.1 s). This is the on-demand compile |
| Production build | Client JavaScript in total | 1.7 MB across all routes; shared chunks 236 + 213 + 198 + 128 + 109 KB |

**Finding: the server on staging is already fast. The slowness you feel is mostly (1) running the dev server, which compiles every page when you first click it, and (2) what the browser has to download, run and request after the page arrives.** The plan therefore starts with how you test, then fixes the real browser-side costs.

## Plan, in order of effect

### Phase 0: measure the right thing (half a day)
1. Test performance on **staging or a local production build** (`npm run build` then `npm start`), never on `npm run dev`. Add a short `docs/performance/HOW-TO-MEASURE.md` with the commands.
2. Record a baseline in the browser (Lighthouse or the DevTools Performance tab, mobile throttling) for: home, a deal page, the account page, the admin deals page. Keep the numbers (LCP, INP, total JS, number of requests).
3. Add timing to the server logs (route, duration, number of database queries) so slow routes show up without guessing.

### Phase 1: quick wins, low risk (1 to 2 days)
1. **Image caching.** Image addresses never change (the id is unique), yet they are cached for 5 minutes and each one runs a database lookup. Send `Cache-Control: public, max-age=31536000, immutable` for images of published deals, and add `ETag`/`304`. This removes about 20 requests per homepage visit after the first.
2. **Right-sized pictures.** Cards load pictures up to 1600 pixels (`unoptimized`) for slots about 150 pixels wide. Generate a small thumbnail (and a medium one) when an image is stored, and use them on cards and in lists. Expect 70 to 90 percent fewer image bytes on the homepage.
3. **Fewer small requests per page.** Today each page can fire: the sign-in check from the header, the user-name check, the analytics page view, the 15-second heartbeat, and the view counter. Merge the sign-in and user-name checks into one call, run them after the page is idle, and cache the answer in memory for the visit.
4. **Cache public reads on the server.** Categories, stores and the first page of deals change rarely. Use Next's tagged caching with a 30 to 60 second lifetime and clear it when a deal is published, edited or deleted. This also protects the shared database on Hostinger.
5. **Find the 1.4 second deal-page case.** The deal page calls the YouTube reviews service while rendering. Confirm whether it ever calls YouTube live; it must read stored data only and refresh in the background.

### Phase 2: make the browser do less (2 to 4 days)
1. **Cut JavaScript.** Check what is in the 236, 213 and 198 KB shared chunks (bundle analyser). Load the deal-details popup, YouTube section, share menus and the admin-only pieces with `dynamic()` so the homepage only ships what it shows. `DealManager.tsx` (135 KB of source) must be admin-only and split.
2. **Use server rendering where the page does not need interaction.** The homepage is a client component fed by props; move static parts (hero, categories, footer) to server components and keep only the filter, save and card interactions on the client.
3. **Smoother clicks.** Add instant feedback (button states, skeletons, `loading.tsx` per route) and prefetch likely next pages. Keep list updates local instead of reloading the page.
4. **Fonts and layout shift.** Keep fonts self-hosted with `display: swap`, reserve image sizes so the page does not jump.

### Phase 3: server and database (2 to 3 days)
1. **Query review.** Log slow queries for home, deal page, deals API, admin lists. Check indexes against the real filters, remove repeated look-ups inside loops, select only needed columns.
2. **Pagination everywhere.** Admin lists load 50 deals with all relations; use leaner selects and cursor paging.
3. **Connection use.** The database pool is small (5). Confirm no route holds a connection while waiting on a slow network call.
4. **Compression and headers.** Confirm gzip or brotli on HTML, JSON and JavaScript on Hostinger, and long caching for hashed static files.
5. **Analytics and rollup.** The nightly rollup and raw-event deletion keep the database small; check the cron is running.

### Phase 4: keep it fast (ongoing)
1. A performance budget in the checklist: for example home LCP under 2.5 s on a mid-range phone, total JavaScript under 300 KB on first load, API p95 under 400 ms.
2. A small script `npm run perf:check` that times the key URLs on staging and fails if they regress.
3. Re-measure after every phase and write the numbers in `docs/performance/RESULTS.md`.

## Expected results (to be proven by measurement, not promised)
- Browsing images: most of the speed gain on slow mobile connections.
- Fewer requests and smaller JavaScript: faster first paint and clicks that respond at once.
- Server cache: steadier response times when many people visit together.

## Decisions for you
1. Test on staging or a local production build from now on (recommended).
2. Whether to add a free CDN-style layer later. Not planned: you asked to stay on the Hostinger plan, and immutable image caching gets most of the benefit.
3. Whether to do Phase 1 now, before the security audit.
