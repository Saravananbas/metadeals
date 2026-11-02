# M2.5 Security Decisions — Approved Implementation Record

**Status:** Implemented for the local development application  
**Scope:** M2.5 authentication, authorization, account setup and admin foundation  
**Owner approval:** The user explicitly approved local email/password accounts,
Argon2id, mandatory administrator TOTP, database-backed sessions and the
one-time CLI bootstrap for `saran.be.2005@gmail.com`.

This decision replaces the earlier provider-comparison draft. It does not
authorize M3, production deployment, external messaging, affiliate operations
or a mobile token API.

## Identity and credentials

- Accounts use email/password credentials, normalized to lowercase email.
- Passwords use Argon2id (64 MiB memory, 3 passes, parallelism 1) and a minimum
  8-character application policy. Common weak passwords, repeated-character
  passwords, control characters, and passwords containing the email name are
  still rejected.
- All active admin accounts require TOTP enrollment before activation or session
  issuance. TOTP uses six digits, a 30-second step and one-step clock tolerance.
- TOTP secrets are encrypted with AES-256-GCM using an independently generated
  32-byte key. Accepted TOTP time steps are stored and atomically replay-checked.
- Ten random recovery codes are shown once; only HMAC hashes are persisted and
  each code is consumed once.
- A one-time setup token is random, HMAC-hashed at rest and expires in 30 minutes.
  Bootstrap is disabled by default, forbidden in production, and gated to the
  exact approved initial address. The setup CLI requires typed confirmation.
- No local OAuth/email-provider route is mounted. The prior NextAuth options
  scaffold remains dormant; its Credentials JWT behavior is not used.

## Session and request policy

- Sessions use random opaque 256-bit bearer tokens; only HMAC hashes are stored.
- Database sessions expire after 60 minutes of inactivity and after 12 hours
  absolutely. Activity is refreshed at bounded five-minute intervals.
- Cookies are HttpOnly, SameSite=Lax, host-only and path `/`; production cookies
  use Secure and the `__Host-` prefix.
- Login, setup, reset-confirm and admin mutation endpoints require a same-origin
  `Origin` matching `NEXTAUTH_URL`. JSON bodies are capped at 16 KiB.
- Login throttling uses HMAC-derived email, proxy-IP and email/IP-pair buckets.
  Raw IP addresses are not stored; session metadata stores a digest.
- Production ingress must strip and replace `x-forwarded-for` / `x-real-ip`.
  The email bucket remains a secondary control if proxy headers are spoofed.

## Roles and privileged operations

| Role | M2.5 scope |
|---|---|
| SUPER_ADMIN | Account creation across roles, role/status control, audit read and all defined auth/security administration |
| ADMIN | Create Editor accounts and suspend/reactivate Editors; no role/security management or higher-privilege account creation |
| EDITOR | No access to the M2.5 account portal; deal permissions exist only as policy definitions for a future authorized M3 module |

Authorization is checked server-side, not inferred from UI visibility. Users
cannot change their own role/status. Role/status changes revoke applicable
sessions, protect the last active SUPER_ADMIN and commit with an audit event.
Account setup requires an explicit admin attestation that the email is verified
and that the one-time setup link will be delivered privately.

## Reset and email-delivery boundary

No verified email provider or credentials were supplied. No SMTP client is
included and the website does not claim that a reset email was sent. An
authorized local operator can issue a 30-minute reset token using
`npm run auth:reset-link -- <verified-email>`, confirm a private delivery
channel, and share the link out-of-band. Reset completion consumes the token,
revokes all sessions and invalidates earlier reset tokens.

Automated delivery requires a separately approved provider/security review.
Never place links in public logs, tickets, shared chat or source control.

## Audit and privacy

`AuditEvent` captures actor, action, target, outcome, request ID, timestamp,
hashed IP and bounded user-agent values. Auth credentials, raw tokens, passwords,
TOTP secrets and recovery codes are not recorded. Account changes and session
issuance are written transactionally with their mutations. Failed login audit
events use generic reason codes.

Audit retention, privileged audit export, backup policy and tamper-resistant
production storage remain launch decisions.

## Database and operational boundary

The migration `20261102043311_m25_credentials_mfa_admin` is additive and has
been applied only to the configured local database. No reset/drop or production
migration was run. The bootstrap CLI was not executed, so no user account was
created. Existing `.env` files remain untouched; new auth secrets must be
generated independently and manually added when an existing environment
predates M2.5.

## Remaining production gates

- Provision the approved first administrator only when the owner is ready.
- Configure trusted proxy behavior and test rate limiting through ingress.
- Establish secure manual reset operations or approve a verified mail provider.
- Design comprehensive CSP/HSTS for the actual HTTPS host.
- Define audit retention, backup/recovery and incident-response ownership.
- Do not add deal, affiliate, publishing, mobile or production capabilities
  without the next explicit milestone authorization.
