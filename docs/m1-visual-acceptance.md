# M1.5 light-blue glassmorphism refinement — 2 November 2026

**Status: complete and validated.** The existing homepage was refined in place
against the latest approved light-blue reference at `prompts/image-1.png`; this
report does not claim pixel-identical assets.

Reference: the owner's attached glassmorphism design. Responsive screenshots at
1536×1024, 768×1024, 390×844, and 320×800 are retained below.

## Visual review

| Area | Finding and correction | Remaining difference |
| --- | --- | --- |
| Header/logo/navigation | Retained the rounded, frosted-glass header with a cool white/blue surface, fine border, and purple active state. | The locally drawn brand mark remains an approximation; final logo artwork was not supplied. |
| Typography | Manrope is loaded with `next/font/google` at weights 400, 500, 600, 700 and 800 and mapped to the shared sans-serif theme. | No licensed brand-specific logo type treatment was supplied. |
| Hero and search | Tuned the former lavender-heavy backdrop to the reference's `#F1F5FF` page, `#F7F9FF` secondary surface and `#E9EEFF` highlight, with purple/orange hierarchy, glass search and the frosted deal-highlight panel. | Current hero product artwork is composed from existing illustrations, not the exact reference artwork. The supplied reference includes additional product artwork that is not available in the repository. |
| Hero imagery | Arranged the existing laptop, headphones, phone, and watch illustrations around a CSS shopping bag and soft podium. | Category emoji and the CSS bag remain approximations of the supplied detailed artwork. |
| Categories | Preserved all category filtering while enlarging the rounded blue-white pill icon surfaces and soft blue-grey elevation. | Platform emoji are less polished than final bespoke category icons. |
| Deal cards | Grouped deals, promotions, and benefits in a rounded glass container; six/three/two/two deal columns at the required widths. | Demo disclosures and expiry lines remain to avoid implying verified offers. |
| Promotions and benefits | Kept retailer colors and actions; placed the benefits row on a lightly frosted surface. | Festival artwork and retailer marks remain illustrative; no live offer claims were added. |
| Mobile layout | Kept the compact navigation, reflowed the hero and highlight panel, and retained horizontally scrollable categories. | Small screens prioritize readable content over the desktop composition. |

No homepage section was added or removed. Existing component structure, APIs and
database configuration remain unchanged. No M3 work/database changes were performed.

## Official color integration

The existing v1.0 stylesheet remains the sole palette source. Its purple/orange
brand and functional primitives are unchanged; four reference-specified neutral-blue
primitives (`#F1F5FF`, `#F7F9FF`, `#E9EEFF`, `#53617F`) now back semantic page, surface,
highlight and secondary-text tokens. Border, hero-gradient and shadow tokens derive
from the shared palette. Semantic variables drive component styles and gradients.

Tailwind v4 consumes the same tokens through `src/styles/tailwind-theme.css`.
Aliases cover existing UI and future form/sidebar/chart primitives; no admin or
analytics screen was created. Dark tokens and a manual dark variant remain available,
but the app has no dark theme attribute or automatic system-preference activation.

See [color integration details](brand-color-integration.md).

## Screenshots and measurements

The original full-page acceptance captures remain the before set:

- [1536px desktop](screenshots/acceptance/desktop-1536-full.jpg), viewport 1536×1024.
- [768px tablet](screenshots/acceptance/tablet-768-full.jpg), viewport 768×1024.
- [390px mobile](screenshots/acceptance/mobile-390-full.jpg), viewport 390×844.
- [320px mobile](screenshots/acceptance/mobile-320-full.jpg), viewport 320×800.

Final production viewport captures after M1.5:

- [1536px desktop](screenshots/acceptance/m15-desktop-1536.png) — 1536×1024.
- [768px tablet](screenshots/acceptance/m15-tablet-768.png) — 768×1024.
- [390px mobile](screenshots/acceptance/m15-mobile-390.png) — 390×844.
- [320px mobile](screenshots/acceptance/m15-mobile-320.png) — 320×800.

The previous M1 captures above provide the before set. Final captures use the
production build, without Next.js development overlays.

## Validation

- `npm run lint`: passed, zero warnings.
- `npm run typecheck`: passed.
- `npm test`: 18/18 passed, including the glass-token regression check.
- `npm run build`: passed with the final visual corrections.
- `npm run test:smoke`: passed: production rendering, seven image assets, WebP image
  optimization, health endpoints, sanitized failure responses and existing M0 behavior.
- All referenced semantic tokens are defined; no additional dependencies were added.
- No hardcoded UI color literals or off-palette Tailwind color utilities remain outside
  the official stylesheet. Existing raster images and platform emoji are not CSS tokens.
- Browser checks cover all four requested widths, Manrope, no document overflow,
  card counts, mobile navigation, search, category/store filters, featured/latest
  views, wishlist toggling, and Escape dialog dismissal. Final captures loaded all
  ten homepage images at each viewport; measured deal columns are 6/3/2/2.
- Prisma schema, migrations, dependencies and repository application structure unchanged.

## M1.5 files changed

Modified:
- `src/app/globals.css` — glass surfaces, responsive layout and hero composition styles.
- `src/styles/metadeals4u-color-system.css` — adjusted existing semantic brand tokens.
- `tests/design-tokens.test.ts` — glass-direction token regression test.
- `docs/brand-color-integration.md` — neutral-blue token documentation.
- `docs/m1-visual-acceptance.md` — M1.5 outcome, screenshots, and checks.
- `docs/screenshots/acceptance/measurements.json` — final responsive browser measurements.
- `docs/screenshots/acceptance/m15-*.png` — four final production screenshots.

No database model, API contract, routing, or dependencies changed.

## Remaining acceptance decisions

1. **Assets are not identical:** approve the current illustrative assets or provide
   final logo/category/product/retailer artwork for exact visual fidelity.
2. **Official contrast pairs need review:** white on accent orange measures 2.61:1;
   white on the discount badge measures 4.46:1. Small text using these pairs does not
   meet a 4.5:1 target. The CTA foreground adjustment remains subject to owner approval.
3. Demo offers remain explicitly unverified. Live prices, bank offers, authentication
   and synchronized wishlists remain future milestones.

The separate multi-platform impact report recommends one shared backend/PostgreSQL,
versioned services and a later npm-workspace migration. No structural migration,
Android/iOS development or deployment was performed. M2.5 and dependent modules are
gated on the identity-provider and initial-admin security decisions documented in
`reports/KNOWN-ISSUES.md`.
