# M7 — Shared API and Future Mobile Readiness

## Objective

Prepare the existing platform for future Android and iOS applications built with React Native + Expo. Do not build the mobile apps in this module.

## Architecture

- Website: existing Next.js application.
- Future mobile: React Native + Expo.
- Shared backend and PostgreSQL.
- Shared business rules and authorization.
- Versioned API contracts.
- Consistent error and pagination formats.

## Review

Inspect whether business logic is coupled to Next.js pages/components or server actions. Extract only the services that genuinely need to be shared by future clients. Avoid a large refactor without clear benefit.

## API requirements

Document stable endpoints/contracts for:
- Authentication/session strategy
- Deal listing and deal detail
- Search and filters
- Categories and stores
- Wishlist
- User preferences
- Affiliate outbound link
- Notification preferences/device registration (future)
- Admin operations (role-protected)

Requirements:
- API versioning strategy.
- Consistent validation and error responses.
- Pagination.
- Authentication and authorization.
- Rate limiting for public endpoints.
- OpenAPI documentation if compatible with current stack.
- Avoid exposing admin-only fields to public clients.

## Deep links

Plan URLs such as:
`https://metadeals4u.in/deal/[slug]`

Document web fallback and future Android App Links/iOS Universal Links behavior.

## Design system

Document shared design tokens for:
- Colors
- Typography
- Spacing
- Radius
- Shadows/elevation
- Component states

Keep CSS/web-specific implementation separate from portable token values so React Native can consume the same source values later.

## Tests

API contract tests, authorization tests, pagination and validation.

## Out of scope

Do not create Expo projects, native builds, app store accounts or mobile-specific screens.
