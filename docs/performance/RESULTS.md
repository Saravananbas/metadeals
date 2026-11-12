# Performance results

Measured 13 Nov 2026 on a local production build (`next build` + `next start`), not `npm run dev`. Re-run with `npm run perf:check -- <url>`.

| URL | Worst of 3 warm runs | Size |
|---|---|---|
| / | 40 ms | 174 KB |
| /api/v1/deals?limit=15 | 20 ms | 23 KB |
| /api/v1/home-deals | 19 ms | 27 KB |
| /api/v1/catalog | 5 ms | 12 KB |
| /community | 19 ms | 47 KB |

## Changes made
- Public images: cached for a year (immutable) with ETag and 304; thumbnails (`?w=320|640`, WebP, kept in memory) used on deal cards.
- Fixed: merchant logos and gallery images were not treated as public by the media route, so they would 404 for signed-out visitors in production.
- Homepage data (deals, categories, stores) cached on the server for 30 seconds.
- Page size 15 deals per load.
- Deal comments dialog loaded only when opened; loading screens for /community and deal pages.

## Not done (needs a measured reason first)
- Bundle analysis and splitting of the large shared chunks; moving homepage static parts to server components.
- Slow-query logging and index review.
- Staging has not been redeployed; measure there after the next deploy.
