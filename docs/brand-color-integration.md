# Official Brand Color System v1.0

`src/styles/metadeals4u-color-system.css` is the application's v1.0 palette source.
The existing purple/orange brand and functional colors remain unchanged. Four
neutral-blue primitives from the approved M1.5 reference (`#F1F5FF`, `#F7F9FF`,
`#E9EEFF`, and `#53617F`) provide page, panel, accent and secondary-text colors.
Semantic tokens reference these primitives; component styling does not duplicate
the palette.

`src/app/globals.css` imports it globally through the App Router root layout.
`src/styles/tailwind-theme.css` maps Tailwind v4 utilities directly to its semantic
tokens, including shadcn Button, surfaces, form fields, statuses, deal badges, future
sidebar UI and chart series. The default Tailwind color namespace is reset so
unapproved palette utilities are not silently available. Component CSS and SVG
fills/strokes use tokens; existing raster artwork and platform emoji are visual
assets, not theme-controlled CSS colors.

Use `bg-primary`, `text-primary-foreground`, `bg-accent`, `bg-surface`, `text-foreground`,
`border-input`, `ring-ring`, `text-success`, `bg-success-bg`, `bg-discount`,
`text-discount-foreground`, `bg-savings` and `text-savings-foreground` as appropriate.
Primary navigation is purple; important action backgrounds are orange. Retailer
identity tokens are confined to retailer wordmarks. Functional colors must retain
their semantic roles; do not use success green as an unrelated decorative brand hue.

Example future form: `bg-input-background text-input-foreground border-input
placeholder:text-input-placeholder focus-visible:ring-ring`. Chart series map to
the existing primary, accent, success, info and warning tokens; actual analytics
screens are not implemented. No admin/dashboard feature is created by token mapping.

Dark values remain available through `[data-theme="dark"]`; neither the root layout
nor system preferences activate them. Tailwind's dark variant is explicitly bound
to that opt-in attribute. Dark UI requires a separate design/accessibility review.

Regression tests reject literal colors outside the official CSS, palette bypasses,
undefined token references and accidental system-driven dark mode. The official
file remains the only source of raw application color values. Semantic surfaces,
borders, hero gradients, and shadows reference the existing palette primitives.

## Measured contrast limitations

The official white accent-button text on the orange base measures **2.61:1**, and
white text on the official discount background measures **4.46:1**. The small
non-large text using these pairs does not meet a 4.5:1 contrast target. Savings
green on the supplied savings background measures **4.57:1**. This is a focused
token-pair check, not a complete WCAG audit. Retained official colors should not be
described as fully accessibility-approved until the owner approves a palette or
foreground-role adjustment. The supplied gradient is preserved, so its light orange
endpoint retains the CTA contrast limitation.

Future React Native/Expo tokens should be generated from this source, not copied
into an independently maintained palette. See `multiplatform-impact.md` for the
proposed migration and shared-design-system boundary.
