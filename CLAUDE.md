# MetaDeals4U project instructions

Also read `AGENTS.md` (Next.js version notes; it is rewritten by `next dev`, so project standards live here).

# MANDATORY RELEASE RULE (owner decision, 22 Nov 2026)

Every change goes to **staging first** and reaches **production only by a pull request from `staging` to `main`** after it was tested on https://staging.metadeals4u.in. Never push to `main`. Never edit production directly: no production files, settings, database changes or Redeploy except as the explicit last step of a promotion the owner asked for. Full procedure: `docs/RELEASE-PIPELINE.md`.

# MANDATORY CROSS-PLATFORM DEVELOPMENT STANDARD

This is a permanent architectural requirement for all MetaDeals4U development.

MetaDeals4U will operate across:

1. Responsive desktop website.
2. Responsive mobile website.
3. Android mobile application.
4. iOS mobile application.
5. Tablet devices.

The Android and iOS applications are planned using React Native / Expo.

## Core principle

Every new feature, page, component, API and workflow must be designed with cross-platform compatibility in mind from the beginning.

Do not build features exclusively for desktop and attempt to retrofit mobile support later.

## Responsive design

Every UI implementation must support:
- Desktop.
- Laptop.
- Tablet portrait.
- Tablet landscape.
- Android mobile browsers.
- iPhone Safari.
- Android native application.
- iOS native application.

Use mobile-first responsive design.

Provide appropriate layouts and interactions for each device.

## Shared backend

All platforms must use the same secured backend services and central database.

Do not create separate user databases for web and mobile.

Preserve shared:
- User accounts.
- Authentication.
- Profiles.
- Deals.
- Discussions.
- Comments.
- Votes.
- Bookmarks.
- Notifications.
- Affiliate tracking.
- Orders and transaction records where applicable.

Mobile applications must never connect directly to MySQL/MariaDB.

All data access must use authenticated, authorized APIs.

## API-first development

New business functionality must be implemented in reusable backend services and documented API contracts.

Do not put essential business rules exclusively in the Next.js frontend.

Ensure APIs can be consumed by both Next.js and React Native applications.

Implement appropriate:
- Authentication.
- Authorization.
- Validation.
- Error handling.
- Pagination.
- Rate limiting.
- Versioning where required.

## Design system

Maintain consistent:
- Brand colours.
- Typography.
- Spacing.
- Buttons.
- Form fields.
- Cards.
- Icons.
- Loading states.
- Error states.
- Empty states.

Use shared design tokens and platform-appropriate components.

Do not force web-only components into React Native.

## Authentication

Support secure authentication across web, Android and iOS.

Google and Apple sign-in must use the correct OAuth flow for each platform (native apps use supported native OAuth flows, not the website login inside a WebView).

Implement secure callback handling and native deep links where required.

Preserve existing MFA and account security.

Never store sensitive authentication tokens insecurely.

## Testing

Every new feature must include:
- Desktop browser testing.
- Mobile browser testing.
- Responsive tablet testing.
- API testing.
- Relevant authorization tests.

When native applications are introduced, include Android and iOS integration tests.

Do not claim native functionality has been tested until it has actually been tested.

## Existing application protection

Preserve the current Next.js application, database, authentication, Prisma schema and production infrastructure.

Do not introduce a second backend or database unnecessarily.

Do not make destructive database changes without explicit approval.

## Final rule

Cross-platform compatibility is a mandatory acceptance criterion for every MetaDeals4U feature.

A feature is not considered complete if it works only on desktop.

Mobile website and future Android/iOS compatibility must be considered from the design and architecture stage.

---

# Project working notes (from the delivery so far)

- Stack: Next.js 16 (read `node_modules/next/dist/docs/` before writing Next code), React 19, Prisma 7 with MariaDB (`prisma/schema.mariadb.prisma`, `prisma/migrations_mariadb`) and a parallel PostgreSQL schema that must be kept in sync, next-auth for customers, custom staff auth with TOTP.
- Local app: http://localhost:4123. Use only disposable databases whose name contains `test` for DB tests; never run tests that create deals/candidates against the development or staging database.
- Staging: https://staging.metadeals4u.in (Hostinger, deploys from the `staging` branch). Production: https://metadeals4u.in (Hostinger Node.js, deploys from `main`); WordPress was retired on 22 Nov 2026. Staging migrations are applied by hand in phpMyAdmin (SQL from `prisma/migrations_mariadb`, plus a row in `_prisma_migrations` with the file's sha256) and need the owner's approval each time.
- Current Android/iOS app in `mobile/` is Flutter (WebView tabs plus native deal list). The standard above plans React Native / Expo for the future apps: treat that as a pending owner decision, do not start a second native codebase without it.
- Security status and open items: `docs/security/PRODUCTION_LAUNCH_TRACKER.md`.
