# Performance progress

| Stage | State |
|---|---|
| 0 Baseline and safety | done: branch `perf/lighthouse`; Stage B1 checked and found absent (see audit) |
| 1 Audit | partly done: homepage mobile/desktop measured; other pages, bundle analyser, backend and hosting not yet |
| 2 Rendering | `cssChunking`, lazy `Header` imports and eager first image done; **server/client split of `Homepage.tsx` not started** (the main remaining lever) |
| 3 Images | media API reviewed (already WebP + immutable cache); hero PNGs not converted; no AVIF |
| 4 JS/CSS | CSS per route done; JS still ~487 KB |
| 5 Fonts/third party | fonts need no change; analytics/consent left as is |
| 6 Backend | not started |
| 7 Hostinger | not started (no server access from here) |
| 8 Testing | Lighthouse mobile x3 and desktop x3 run on a quiet machine; typecheck, eslint and several suites run on touched areas; full `npm test`, `npm ci` and `perf:check` not run |
| 9 Regression | consent flow, expired card, deal pages checked in a browser; wishlist, auth and admin flows only through tests |
