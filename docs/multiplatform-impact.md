# Multi-platform architecture impact report

Status: recommendation, 2 November 2026. No repository migration, business schema
change, mobile project, device API or authentication endpoint is implemented by this report.

## Decision

Keep the current responsive Next.js app in place through M1 acceptance. Build M3 as
one shared backend with one PostgreSQL database and versioned HTTP contracts. Keep
application services independent of Next.js requests, React state and platform storage.
Add a single React Native/Expo codebase for Android and iOS in the later mobile milestones.

Do not replace the web app with Expo Web and do not create separate mobile databases
or duplicated deal/affiliate business logic. Native and web components can differ;
their semantics, contracts, tokens and server-side policies must agree.

## Current repository findings

| Area | Evidence | Impact |
| --- | --- | --- |
| Web entry | `src/app/page.tsx`, App Router | Can remain the web delivery layer |
| Presentation | `src/features/home/`, DOM, Next Image, localStorage | Web-only; do not import into React Native |
| Deal logic | Pure `pricing.ts`, `filter.ts`, `types.ts` | Reusable concepts, but current types describe demo fixtures, not approved public contracts |
| Data source | `service.ts` returns `demo-data.ts` | No production deal repository or API yet |
| Database | Prisma singleton and four identity tables | One schema/migration owner; no deal or device migrations in this task |
| Authentication | NextAuth v4 options, Prisma adapter, no providers/routes | Not an existing mobile authentication solution |
| APIs | Liveness and readiness only | No API contract to break; define `/api/v1` when M3 begins |
| Queue/storage | BullMQ configuration and lazy S3 client | Suitable boundaries, but no jobs or uploads implemented |
| Saved deals | Browser localStorage | Demo-only; cannot synchronize across platforms |
| Tokens | Official v1.0 CSS imported globally | Preserve as canonical color source; generate native values later |

## Shared backend boundaries

Start as a modular backend inside the existing Next.js deployment, without a new
backend framework. Public Route Handlers are thin adapters over application services.
They validate input, resolve identity, invoke services and serialize DTOs. Services
enforce authorization and invariants. Repositories own Prisma queries. React should
not be the only place validating discounts, deal status, expiry or user ownership.

Web Server Components may call the same services directly; Expo calls versioned HTTPS
endpoints. Both use the same authorization boundary. Never import Prisma, secrets or
`server-only` modules into client packages. Future BullMQ workers run separately from
HTTP requests but use the same backend service code, PostgreSQL and migration history.
Extraction into a dedicated API deployment is an operational choice later, not a
prerequisite for mobile compatibility or an excuse to duplicate services now.

## Proposed API contract conventions (not implemented)

- `/api/v1/deals`, `/api/v1/deals/{id}`, categories and stores for public discovery.
- Authenticated `/api/v1/me/wishlist`, `/api/v1/me/preferences`, `/api/v1/me/devices`
  and notification preferences when those capabilities are approved.
- Opaque stable IDs, integer minor currency units with `currency: "INR"`, ISO 8601
  UTC timestamps, explicit nullable expiry, publication/verification states, image
  dimensions and canonical HTTPS URLs. Do not expose Prisma models directly.
- Cursor pagination with deterministic ordering and bounded limits; documented
  filters/sorts, normalized search, validation errors and rate limits.
- JSON success/error envelopes with a safe error code, field errors where relevant
  and request ID. No stack traces, raw database errors or provider tokens.
- OpenAPI plus runtime validation; generate typed fetch clients for both platforms.
  Keep API types platform-neutral and avoid React/Next/Prisma imports.
- Idempotent wishlist PUT/DELETE and documented retry behavior. Use idempotency keys
  for non-idempotent commands; stable event IDs for analytics and publishing.
- Additive changes within v1; version breaking changes and retain a deprecation
  window because installed mobile clients cannot all upgrade immediately.
- Contract tests, ownership tests and schema compatibility checks precede release.

## Authentication and authorization

Recommend one OIDC identity authority and one internal User identity. Web uses secure
HttpOnly cookies; native uses authorization-code + PKCE in a system browser and
short-lived API access tokens. Refresh tokens belong in native secure storage, with
rotation/revocation and device-session lifecycle. Never store auth tokens in the
current wishlist localStorage key or copy web session cookies into Expo.

The server validates issuer, audience, expiry and scopes before resolving the same
user/permissions for every client. Cookie mutations require CSRF protection; bearer
requests require token validation. CORS is not authentication. Authorization belongs
in services, including resource ownership and admin roles, not navigation visibility.

Current NextAuth v4 is not a ready-made OAuth authorization server. Before activating
M4 authentication, approve the identity provider and validate web/native flows together.
Retain or adapt Auth.js as the web session integration only after that decision. Do
not build a bespoke token issuer casually, promise mobile login works today, or start
identity migrations before the provider design is reviewed.

Expo supports system-browser authentication with AuthSession and PKCE. See
[Expo authentication guidance](https://docs.expo.dev/guides/authentication/).

## Links, notifications and preferences

Use stable website URLs such as `/deals/{id}` as canonical destinations. Plan Android
App Links and iOS Universal Links with `/.well-known/assetlinks.json` and
`/.well-known/apple-app-site-association`, real application identifiers and signing
certificates. The website remains the fallback when apps are absent. Validate link
parameters and never allow arbitrary redirect targets. Don't publish placeholder
association files before bundle IDs/domain ownership are finalized. See
[Expo linking overview](https://docs.expo.dev/linking/overview/) and
[iOS Universal Links](https://docs.expo.dev/linking/ios-universal-links/).

Device registration should bind an installation to its authenticated owner and track
platform, push provider/token, app version, token rotation, permission and last-seen
state. Enforce ownership on updates/removal, unregister on logout as appropriate and
remove invalid tokens after delivery receipts. Keep notification opt-in, topics,
channels, quiet hours and timezone server-side and honor them before enqueueing jobs.
OS permission and account preference are distinct; neither implies the other.

A single notification service can target Expo Push/APNs/FCM with retries, deduplication,
rate limits and receipt handling. Push carries an opaque deal ID/canonical link, never
secrets. Fetch fresh details on open; don't trust cached price or push payload as the
source of truth. Native credentials, permissions and physical-device delivery tests
belong to mobile milestones. See [Expo Notifications](https://docs.expo.dev/versions/latest/sdk/notifications/).

Wishlists/preferences become authenticated backend resources in the one database.
On first sign-in, offer an explicit merge of browser-local demo/saved state; do not
silently migrate demo IDs into production. Define conflict behavior, updatedAt/version
fields, idempotency and eventual refresh across devices.

## Shared affiliates, analytics and publishing

All clients request the same trusted outbound redirect/link service. The backend
validates eligible destinations, generates network-specific links, records an
idempotent click with platform attribution and redirects. No affiliate secrets or
commission calculations ship in web/native bundles. Deep linking must not bypass
affiliate attribution or validation.

Use one analytics event taxonomy with event ID, schema version, client platform and
timestamp. Separate product analytics from commission truth and provider reconciliation;
apply consent, minimization and retention requirements. Publishing commands and
Telegram/WhatsApp delivery use the same deal records and queued service workflows.

## Safest future monorepo evolution

Recommended target, only after explicit migration approval:

```text
apps/web/                 Current Next.js app, moved with history
apps/mobile/              One Expo project for Android and iOS (later)
packages/ui-tokens/        Official colors + generated web/native exports
packages/types/            Versioned public contracts and runtime schemas
packages/api-client/       Framework-neutral typed HTTP client
packages/config/           Shared lint/TypeScript/test conventions
```

Backend services stay under `apps/web/src/server` initially. If workers/API deployments
need direct reuse, approve an additional private `packages/backend` package then;
never place server code inside `packages/types` or `api-client`. One deployment owns
migrations even if multiple processes use the database.

1. Finish M1/M2 review in the current structure. Record the passing baseline.
2. Build M3 services/contracts in place; define dependency rules and contract tests.
3. In a dedicated migration PR, use npm workspaces to preserve the existing package
   manager/lockfile approach. Move the web app with `git mv`, update scripts, import
   aliases, env loading, Prisma paths, deployment roots and CI. Keep public URLs stable.
4. Extract tokens/types/client/config one package at a time. Validate install, lint,
   types, tests, production build, migrations and health after each extraction.
5. Add Expo only at the approved mobile milestone. Check React/React Native peer
   compatibility, Metro resolution and package exports; do not force the web React
   version onto native or assume browser APIs exist there.
6. Roll back a failed structural migration by reverting its isolated commit; avoid
   combining folder moves with business schema changes or feature work.

Do not introduce Turborepo/Nx merely for folder organization. Expo supports standard
workspace monorepos, including npm; add build orchestration only if needed. See
[Expo monorepo guidance](https://docs.expo.dev/guides/monorepos/).

## Shared design system

The supplied v1.0 CSS remains authoritative for colors now. Later, generate a typed
light/dark native color map from its resolved values rather than maintaining a second
handwritten palette. Test web/native parity in CI. CSS gradients, shadows and platform
emoji do not translate directly to React Native; map them explicitly to native APIs.
Typography, spacing, radii, interaction states and accessibility guidelines need a
separately approved shared specification (v1.0 currently defines colors/effects, not
a full type/spacing system). Share those tokens/guidelines, not DOM/shadcn components.
Dark mode stays opt-in and requires its own design review on each platform.

## Updated milestone map supplied by the owner

| Milestone | Deliverable / current status |
| --- | --- |
| M0 | Foundation — complete |
| M1 | Homepage — visual review / approval pending |
| M2 | Responsive website — implemented, acceptance review included with M1 |
| M3 | Deal management and shared APIs — not started |
| M4 | Admin dashboard — not started |
| M5 | Live search and filters — demo search exists; live implementation pending |
| M6 | Affiliate monetization — not started |
| M7 | WhatsApp and Telegram automation — not started |
| M8 | SEO, analytics and website launch — not started beyond M0/M1 foundations |
| M9 | Android application — not started |
| M10 | iOS application — not started |
| M11 | App Store and Play Store launch — not started |

M9/M10 are separate acceptance/release milestones over one planned Expo codebase.
Keep responsive web tests throughout every milestone. This report does not authorize
or perform any migration, provider purchase, mobile build or production deployment.
