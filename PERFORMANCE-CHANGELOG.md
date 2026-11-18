# Performance changelog

## Stage 2 / 4: rendering and bundles
- `next.config.ts`: `experimental.cssChunking: "strict"`. A page now loads only the CSS of modules it imports. Home CSS 184 → 109 KB. Side effect to watch: more CSS files on some routes; community, account and deal pages were opened after the change and looked unchanged.
- `src/features/home/components/Header.tsx`: `signOut` (next-auth client) and `UserNamePrompt` load only for signed-in visitors (dynamic import). Home JS about -115 KB.
- `src/features/home/components/DealCard.tsx`, `TopDealsSection.tsx`: card 0 gets `loading="eager"` and `fetchPriority="high"`.
- `src/features/home/components/Footer.tsx`: legal links use `prefetch={false}`. Saves 5 requests and about 15 KiB on first load; those pages open a little slower the first time.

## Tried and reverted
- Delaying the consent banner until after `load`: LCP unchanged (the element's simulated paint time is bound by JavaScript, not by when the banner mounts). Reverted.
- Server-rendering the banner with a head script that hides it for returning visitors: consent flow verified in a browser (first visit, accept, returning visit, reopen, decline) but Lighthouse LCP unchanged (73-87 across runs, LCP 3.3-3.9 s). Reverted to keep the code simple.

## Outside the performance brief but in the same branch
Admin and account work (see git log). None of it changes the public homepage code.
