# Authentication and authorization (as found in source, 13 Nov 2026)

## Principals
Anonymous visitors; customers (`Customer`, next-auth credentials plus Google/Apple); forum members (`ForumProfile`); staff (`User`: SUPER_ADMIN, ADMIN, EDITOR); machine callers (cron, Telegram webhook).

## Staff sign-in
- Password: argon2id (64 MiB, time cost 3). Policy: 8 to 128 characters plus a blocklist. A dummy hash equalises timing for unknown emails; all failures return one generic message.
- MFA: authenticator-app TOTP is mandatory. Secret encrypted at rest (AES-256-GCM, key `AUTH_TOTP_ENCRYPTION_KEY`). A used time-step cannot be replayed. Ten recovery codes, HMAC-hashed, single use.
- Session: random 32-byte token stored as an HMAC; cookie `__Host-metadeals-session` in production (HttpOnly, Secure, SameSite=Lax). Inactivity timeout 60 minutes and absolute 12 hours, enforced on the server on every request; the live role and status are re-read from the database each time. Login replaces the session. Password reset and role/suspension changes delete sessions.
- Lockout: database counters per email, network and pair; five failures then exponential delay up to 15 minutes; generic errors.
- Provisioning: no default password. The first super admin is created by a local command; bootstrap is blocked in production at env-parse time and after the first admin exists. Password reset is operator-issued only (no public reset request).
- `AUTH_DISABLED_DEV` is ignored when `NODE_ENV=production`. **Risk:** the guard is only `NODE_ENV`; never set it outside local development.
- Optional IP allow-list (`ADMIN_ALLOWED_IPS`) in `src/proxy.ts` for `/admin`, admin APIs and admin sign-in routes.

## Staff authorization
Roles map to permissions in `src/server/auth/permissions.ts` (unknown role denies). EDITOR: deal:create, deal:edit, deal:publish. ADMIN adds merchant, category, affiliate, operations, forum and some account permissions. SUPER_ADMIN has all, and only a super admin changes roles; nobody changes their own role or removes the last super admin.
The admin API is one router gated on `deal:edit`; individual branches add finer permissions. **After this audit** merchant-websites writes, category delete, scraper ingest/scan, Cuelinks and the kill switch carry their own checks. Branches still relying on `deal:edit` alone: media upload, product extraction and imports (deal-authoring support), scraper review (EDITOR holds `deal:publish`).

## Customer authentication
Email-code sign-up (6 digits, 10 minutes, 5 tries, hashed), password hashing as above, Google/Apple linking only with a provider-verified email. JWT session 24 hours; disabled accounts are rejected on every session read. Customer identity comes only from the session, never from the request body. State-changing routes check the request origin.

## Known gaps
Customer JWTs cannot be revoked before expiry except by disabling the account. Customer password sign-in is limited per address (IPv6 /64), per email and address, and per email; a distributed attacker (about four or more addresses) can still lock one customer out for 15 minutes and guess about 30 times per 15 minutes. Row-level security is not available on MariaDB.

## Customer sign-in protection: validation (13 Nov 2026)
Implementation: `src/server/customer/service.ts` (`loginCustomer`), `src/server/client-ip.ts`. Tests: `tests/login-throttle.test.ts`, **7 database tests, all passing** (also run as a DML-only database user).

| Question | Answer and evidence |
|---|---|
| Are successful devices recognised securely? | What is remembered is a **network address (an IPv6 /64 or an IPv4 address), not a device**. After a correct password the app stores a keyed hash (`HMAC` with `AUTH_SESSION_SECRET`) of `email + address` in the existing counter table. The stored key contains neither the address nor the email (test: key does not match the address or email text). |
| Can trust be trivially spoofed? | A visitor cannot choose their own address through headers (proxy behaviour verified on staging: `HOSTINGER_PROXY_VALIDATION.md`). Trust is only created inside `loginCustomer` after a correct password (`grep login-known` finds that single writer; test: a failed attempt creates none). Residual: anyone who shares the customer's address (same home network, same mobile-carrier address) is treated as "known" during an attack, but still needs the password and is limited to 8 tries per 15 minutes. |
| Do trust records expire after 30 days? | Yes: the row expires 30 days after the last successful sign-in (test: `29.9 < days <= 30`) and the address stops counting after that (test: expired address is held back during an attack). |
| Can a device identifier be used as a credential? | No device identifier exists. Nothing is stored in the browser and nothing can be presented instead of a password. |
| Do progressive delays work? | Failures 4 to 8 from one address wait 0.2, 0.4, 0.8, 1.5 and 1.5 s; the 9th is refused (test: later attempts measurably slower). |
| Can a distributed attack bypass protection? | 40 attempts from 40 different addresses put the account in attack mode; the attackers get nowhere and an unknown address is held back even with the right password (test). Guessing is limited to about 30 attempts per 15 minutes in total across all unknown addresses. |
| Can legitimate customers still sign in? | Yes: normal sign-in, sign-in from a second address while another address is failing, sign-in from the usual address during an attack, and the same generic failure for unknown emails and wrong passwords (tests). |
| Does session theft grant trusted status? | No. A stolen session cookie is never used by `loginCustomer`, and trust is written only after a password check. A thief with a session does not need to sign in, which is a separate risk (JWT cannot be revoked early; see Known gaps). |

### Known limitation: new-device waiting period
While an account is under a distributed attack (more than 30 attempts in 15 minutes from different addresses), the customer **cannot sign in from a NEW network until the attack stops** (up to 15 minutes after it ends). The usual phone or computer keeps working. This is accepted for launch.

### Email one-time code and trusted-device cookie: AWAITING_OWNER_APPROVAL
An emailed code for sign-ins from new networks (and optionally a trusted-device cookie) would remove the waiting period. It changes the sign-in experience and sends more email, so **no change is made until the owner approves**. Customer password reset does not exist (customers re-register or contact support); staff password reset is operator-issued and staff sign-in requires an authenticator code.
