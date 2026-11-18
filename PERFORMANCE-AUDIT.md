# MetaDeals4U performance audit (homepage, mobile first)

Branch `perf/lighthouse`. All numbers are **lab** results from a local production build (`next build` + `next start` on port 4125), Lighthouse 12, mobile preset, simulated slow-4G / 4x CPU. They are not field data; INP has **not** been verified. SEO is out of scope.

## Verified facts about the repository
- Versions match the brief: Next.js 16.4.6, React 19.3.1, Tailwind 4.3.3, Prisma 7.10.1, Node 24.14.1 (`.nvmrc`).
- **Stage B1 is not present.** `public/images/products/` still holds six ~1.5 MB PNGs, `HeroSection.tsx` still references `.png`, and there is no `PERFORMANCE-OPTIMIZATION-CHANGELOG.md`. No archive was supplied, so nothing was compared.
- The media API (`src/app/api/v1/media/[id]/route.ts`) already serves resized WebP (`?w=320|640`) with `Cache-Control: public, max-age=31536000, immutable`, ETags and a 300-entry in-memory thumbnail cache. Deal cards use it (`unoptimized` next/image with `?w=640`).
- Fonts: Manrope through `next/font`; the build emits one latin variable file (24 KB), so weight reduction gains nothing.

## Findings (evidence in `.local/lh/*.json`)
| # | Finding | Evidence | Status |
|---|---|---|---|
| 1 | Home page loaded CSS of unrelated routes (community, profile, dashboards) | CSS 184 KB / 3 files → 109 KB after `cssChunking: "strict"` | fixed |
| 2 | `next-auth` client and the profile prompt were in the homepage bundle | JS ~600 KB → ~487 KB after lazy imports in `Header.tsx` | fixed |
| 3 | First deal image was lazy | `loading="eager"` + `fetchPriority="high"` on card 0 | fixed |
| 4 | 14 `?_rsc=` prefetch requests + their chunks on load (footer/tab-bar links) | network-requests audit | footer links `prefetch={false}`: 64 → 59 requests, 384 → 369 KiB; tab bar left as is |
| 5 | **Mobile LCP 3.7–3.9 s (simulated) but observed LCP is 0.8–1.1 s.** The LCP element is the consent-banner paragraph; 88 % of its time is "element render delay" | LCP breakdown, metrics: observed vs simulated | cause = JavaScript executed before first paint (1.2 s HTML/inline RSC parse, 0.9 s unattributable, 0.6 s react-dom, 0.4 s next client), multiplied by the 4x CPU model |
| 6 | Home HTML is 263 KB uncompressed; 48 KB is RSC flight data; each of 28 cards ships its full `description` | `.local/home.html` | open |
| 7 | Lighthouse warns "page loaded too slowly to finish" on the homepage only (`/privacy` has no warning, trace ends at 2.7 s; homepage trace runs to 45 s) | `observedTraceEnd` 45 000 ms vs 2 681 ms | open. In a real browser the homepage settles: 0 new requests and 0 long tasks in 20 s. Cause not found |
| 8 | `/api/v1/customer/session` returns 500 for anonymous visitors on the production build; `/api/v1/messages/unread` 401, `/api/v1/analytics/collect` 403 on first load | network-requests audit | open, needs checking (possible console errors) |
| 9 | Desktop run 1 scored 71 (TBT 641 ms) while runs 2-3 scored 97 / 96 | three runs | cold start noise |

## Not measured yet
Lighthouse for deal details, category and search pages; bundle analyser output; Redis/BullMQ usage; database query timing; Hostinger TTFB and headers on staging.
