# API Design — Proposed Contract Principles

**Status:** M2.5 auth/admin routes are implemented; no business API contract is
implemented.

## Verified current routes

- `GET /api/health`: liveness endpoint.
- `GET /api/health/ready`: PostgreSQL/Redis readiness endpoint.
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/session`.
- `POST /api/auth/setup/start`, `POST /api/auth/setup/complete`,
  `POST /api/auth/password-reset/confirm`.
- `GET/POST /api/admin/accounts`, `PATCH /api/admin/accounts/{id}`,
  `GET /api/admin/audit`, all guarded server-side.
- No deal, affiliate redirect, or notification API exists.

The existing Next.js App Router and server-side deal service are suitable
foundations. The homepage data source is demo-only; the current saved-deal
feature is browser-local storage and is not shared across devices.

## Proposed contract conventions

These are recommendations, not frozen contracts:

- Version business APIs under `/api/v1`; preserve current health paths as
  operational endpoints.
- Use server-side feature services as the business-rule boundary. Route handlers
  should validate, authenticate/authorize, call the service, and serialize a
  stable DTO; pages/server actions should not become the only place where rules
  live.
- Validate all query/body/path parameters with the existing Zod dependency.
- Use cursor pagination with deterministic ordering for deal lists. Enforce
  bounded page sizes and document filter semantics.
- Keep public DTOs separate from admin DTOs; never serialize private merchant,
  moderation, audit, provider secret, unpublished or user fields by default.
- Use a consistent error envelope aligned with HTTP semantics (problem type,
  stable code, safe message, request/correlation ID, optional field issues).
  Never return stack traces, SQL/provider errors, secrets or internal identifiers
  unnecessarily.
- Define idempotency for mutations and delivery/click-sensitive operations.
- Apply authorization at service/handler boundaries and rate-limit public search,
  auth-sensitive and outbound redirect endpoints.
- Document API with OpenAPI only after route/service schemas are stable; generate
  or test the document against the actual validators rather than maintaining a
  speculative duplicate contract.

## Authentication and client strategy

- Web: M2.5 uses an HttpOnly, SameSite=Lax, host-only opaque cookie backed by
  HMAC-hashed database sessions (60-minute inactivity, 12-hour absolute).
  Production cookies are Secure. Unsafe cookie-authenticated requests enforce
  same-origin checks.
- Login enforces Argon2id password verification, mandatory TOTP or one-time
  recovery code, replay protection and HMAC-derived email/IP throttling.
- The initial SUPER_ADMIN is CLI-provisioned; no account was created during
  implementation. Password reset is operator-assisted because no email
  transport is configured.
- Future mobile: no provider is selected. Define API audience/scopes,
  access-token lifetime, refresh/revocation, key rotation and user logout before
  exposing bearer-token APIs.
- Do not share browser cookies, secrets or server-only database access with
  native applications.
- M2.5 account/audit routes require explicit server-side permission checks.
  Client-side route hiding does not provide authorization. The account list
  returns a restricted projection; audit routes do not return IP hashes or
  user-agent metadata.

## Candidate endpoint families (not implemented)

| Family | Candidate purpose | Prerequisite |
|---|---|---|
| `GET /api/v1/deals` | Public published deals, search, category/store filters and cursor pagination | M3 verified, published deal source |
| `GET /api/v1/deals/{slug}` | Public detail projection | M3 stable slug and availability semantics |
| `GET /api/v1/categories`, `GET /api/v1/merchants` | Active discovery taxonomies | M3 catalog |
| `GET/PUT /api/v1/me/wishlist` | Cross-device wishlist | M2.5 user identity and M3 deal IDs; current local-only behavior must remain backward-compatible until migration is approved |
| `GET/PUT /api/v1/me/preferences` | User settings | M2.5 identity and explicit preference scope |
| `POST /api/v1/deals/{id}/outbound` | Resolve a trusted affiliate destination and record a click | M3 trusted URL plus M4 verified provider/redirect policy |
| `GET/POST/PATCH /api/v1/admin/...` | Protected deal/category/merchant operations | M2.5 authorization and M3 services |
| `GET/PUT /api/v1/me/notification-preferences` | User-controlled channel preferences | M2.5, M5 consent and approved channel policy |
| device registration endpoint | Future push-device registration | Separate mobile/push provider, opt-in and token lifecycle decision |

## Deep links

The planned web detail URL is `/deal/[slug]` with an accessible web fallback.
Before App Links/Universal Links, define canonical host, verified asset links,
association files, redirect behavior, attribution/privacy, and a web fallback
that works when the native app is absent. No domain or deal slug route is
currently approved/implemented.
