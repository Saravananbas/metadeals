# Performance validation

Lighthouse 12, local production build, homepage, simulated throttling. Quiet machine, three runs each. Lab data only.

| Build | Run | Perf | FCP | LCP | TBT | CLS | SI | Transfer |
|---|---|---|---|---|---|---|---|---|
| first baseline (busy machine) | mobile | 72 | 1.3 s | 3.0 s | 1,050 ms | 0.026 | 2.9 s | 384 KiB |
| after CSS/JS changes | mobile m1 | 87 | 1.6 s | 3.6 s | 175 ms | 0.000 | 2.2 s | 384 KiB |
| | mobile m2 | 87 | 1.6 s | 3.8 s | 134 ms | 0.018 | 2.6 s | |
| | mobile m3 | 87 | 1.6 s | 3.8 s | 124 ms | 0.000 | 2.3 s | |
| | desktop d1 | 71 | 0.5 s | 1.0 s | 641 ms | 0.002 | 1.7 s | 439 KiB |
| | desktop d2 | 97 | 0.4 s | 0.9 s | 64 ms | 0.002 | 1.5 s | |
| | desktop d3 | 96 | 0.4 s | 1.0 s | 111 ms | 0.002 | 1.5 s | |
| + footer prefetch off, banner delayed (reverted) | mobile n1-n3 | 86 / 84 / 86 | 1.6 s | 3.8-3.9 s | 142-206 ms | 0.018 | 2.5-2.9 s | 369 KiB |
| + SSR banner (reverted) | mobile p1-p3 | 73 / 86 / 87 | 1.3-1.6 s | 3.3-3.9 s | 116-830 ms | 0-0.084 | 2.1 s | 372 KiB |

Accessibility 96 and best practices 96 in every run. Every homepage run carries Lighthouse's "page loaded too slowly to finish" warning.

Real-browser check (Chrome via the app, production build): no new requests and no long tasks in 20 s after load.

Not verified: field data, INP, other page types, staging.

Tests run after the related code changes: typecheck, eslint on touched folders, `security-regression`, `design-tokens`, `admin-roles-routes`, `moderator-system`, and the new account/deal-tab suites on a disposable database. `npm test`, `npm ci` and `npm run perf:check` have not been run.
