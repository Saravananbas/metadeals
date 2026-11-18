# Optimisation plan (next steps, in order of expected effect)

1. **Homepage server/client split.** `Homepage.tsx` is one client component; the hero, category strip, banners, "why" section and footer are static. Render them as Server Components and keep search, filters, saved deals, dialogs and card interactions on the client. Goal: less JavaScript before first paint (the evidence shows first paint is gated by script execution, see audit finding 5). Needs care: the cards share state (saved deals, filters).
2. **Trim what the server sends to the client.** Cards receive the full description and other unused fields for 28 deals (about 48 KB of flight data in a 263 KB page). Send only what the card and its dialog need.
3. **Hero images.** Convert the six 1.5 MB PNGs to WebP/AVIF at the sizes used (about 500 px) and reference them directly; keep PNGs for rollback.
4. **Find the cause of the "never settles" warning** (homepage only). Candidates to test one by one: the rotating card galleries (3 s interval), the unread-message poll, analytics beacons, CSS animations.
5. **Check the console/network errors** seen on first load for anonymous visitors (`/api/v1/customer/session` 500).
6. **Measure the other pages** (deal details, category, search) and run a bundle analyser to name the large dependencies.
7. **Infrastructure (needs your approval and access):** confirm gzip/brotli and cache headers on Hostinger, check TTFB on staging, and whether Node runs with enough memory for Sharp.
