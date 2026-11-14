# Native app (React Native / Expo) API readiness review (13 Nov 2026)

Scope: review only. No native app was built; no second database; no WebView substitute.

## What already works for a native client
- **Discussion reading:** `GET /api/v1/community/discussions` (added today: filter, sort, view, type, community, q, page, limit), `.../posts/[ref]`, `.../posts/[ref]/comments?sort=&cursor=`, `.../overview` (statistics, trending, own counts, added today), `.../announcements` (added today), `.../communities`.
- **Engagement writes:** vote, like, save (bookmark), report, comment, edit and delete, post create/edit/delete, drafts, picture upload (multipart), view counting, notifications (`GET /api/v1/community/notifications`, `POST .../notifications/read`). All are plain JSON/multipart HTTP with server-side authorization.
- **Pagination:** page numbers (discussions), cursor (older feed, comments). Consistent enough; document one style before the apps.
- **Short links:** `/p/<code>` for sharing.

## Update 14 Nov 2026
Gaps 1 and 2 are now implemented locally: `POST /api/v1/mobile/auth/login` issues a Bearer app token, and Bearer requests need no `Origin` header (cookie requests still do). Refresh tokens, Google/Apple native sign-in (needs client ids) and push registration (needs Firebase) were added afterwards: see `docs/PROFILES_AND_MESSAGING.md` section 9. Messaging and profile APIs are listed there.

## Gaps to resolve BEFORE native app development
1. **No token-based sign-in.** Customer sessions are NextAuth cookies tied to the browser flow (CSRF cookie plus form post). A native app needs a token flow: an endpoint that exchanges credentials (or a verified provider token) for a short-lived access token plus refresh token, stored in the device's secure storage, and a way for the API routes to accept `Authorization: Bearer ...`.
2. **Writes require an `Origin` header** (`assertSameOrigin`): native HTTP clients do not send one, so every POST/PUT/PATCH/DELETE would be answered 403. Bearer-token requests must be exempt from the browser origin check (the origin check exists to stop cross-site browser forgery, which does not apply to token requests).
3. **Google and Apple native sign-in do not exist.** Web OAuth runs through NextAuth redirects. Native needs: Google Sign-In SDK / Sign in with Apple on the device, an endpoint that verifies the provider ID token (audience, issuer, expiry, nonce) and issues the app token; account linking must keep the existing rule (provider-verified email only). Google also refuses OAuth inside embedded WebViews, which is why the current Flutter app hides those buttons.
4. **MFA:** customers have no MFA; staff TOTP is a web-only admin flow (staff should not use the native app).
5. **Inconsistent error shape:** community routes return `{ "error": "message" }`; admin routes return `{ "error": { "code", "message" } }`. Pick one for the public API (the simple string plus an HTTP status works).
6. **API contract document / versioning:** routes are under `/api/v1`, but there is no OpenAPI description. Generate one from the zod schemas before the apps are built.
7. **Push registration:** no device-token table or endpoint; notifications are in-app only (APNs/FCM is a later approved phase).
8. **Rate limiting** is per member/address and works for tokens too, but the limiter keys must use the token's member id (they already use the member's profile id for writes).
9. **Image delivery:** pictures are served as WebP at `/api/v1/community/images/[id]` (public once the post is published, owner-only before); fine for native image components; add `Cache-Control` tuning and size variants if mobile bandwidth matters.

## Recommendation
Build gaps 1 to 3 first (token auth and provider-token verification), as a small separate phase, then generate the contract (6). Everything else can be consumed as is.
