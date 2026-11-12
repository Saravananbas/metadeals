# Security architecture

## Layers
1. **Edge / hosting** (Hostinger): TLS and the reverse proxy. Facts about header handling are UNVERIFIED (see `NEEDS-VALIDATION.md`).
2. **`src/proxy.ts`**: optional IP allow-list for the admin portal; answers "Page is not available" (404) to others. Uses `src/server/client-ip.ts`.
3. **Response headers** (`next.config.ts`): nosniff, frame denial (X-Frame-Options and CSP `frame-ancestors`), referrer policy, permissions policy, HSTS in production, and a **Report-Only** full CSP.
4. **Route guards**: staff session + permission per branch; customer session derived server-side; origin check on state-changing requests; strict zod schemas on writes; body size caps.
5. **Data access**: Prisma with ownership in every `where`; parameterised raw SQL only; MariaDB (no RLS).
6. **Outbound requests**: product fetching only to allowlisted retailers over https, resolved address pinned, private ranges blocked, redirect hops re-checked, size and idle timeouts. Fixed hosts for Cuelinks, YouTube, Telegram, WhatsApp, Resend.
7. **Media**: every upload is re-encoded to WebP by sharp with pixel and size caps; keys are server-generated UUIDs; reads validate the key pattern.
8. **Logging**: pino with redaction of secrets and nested fields; errors returned to clients are generic.

## Trust boundaries
Anonymous to public routes; customer to own records; staff by role; machines by shared secrets. The only cross-principal data (public forum content) goes through allow-list serializers that never include email or customer id.

## CSP rollout plan
The Report-Only policy allows self, inline scripts (needed by Next today), YouTube frames, https images. Steps: deploy to staging; browse every page (home, deal, forum, sign-in with Google/Apple, post-deal) with the browser console open; fix violations; switch the header to enforcing. A nonce-based policy (dropping `'unsafe-inline'`) needs every page to be dynamic and is NEEDS_VALIDATION for Next 16.

## Single points of trust
`AUTH_SESSION_SECRET`, `AUTH_TOTP_ENCRYPTION_KEY`, `NEXTAUTH_SECRET` (distinct, enforced in `src/config/env.ts`), the database user, the Hostinger account.
