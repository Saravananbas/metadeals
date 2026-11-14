# Member profiles and private messaging (14 Nov 2026)

Status: **built and tested locally only.** Not deployed to staging, not committed, not production-ready. Staging needs the migration `20261124100000_profiles_messaging` (owner approval) before any of this can run there.

## 1. Architecture audit (before building)
- **Messaging already half-existed:** `DmThread`, `DmMessage`, `DmBlock`, `DmReport` (migration `20261116100000_direct_messages`) plus a service with a "message request" step, switched off by `MESSAGES_ENABLED`. No routes, no screens, no real-time. Reused and extended; no second messaging model was created.
- **Reused:** `Customer` (accounts), `ForumProfile` (public identity: handle, bio, avatar), `ForumNotification` (the one notification table), `CustomerRateLimit` counters, the avatar storage/re-encoding in `server/customer/identity.ts`, `ReportButton` and the profile report target, `assertActiveCustomer`, `customerApi` request wrapper, `publicWhere` for deals, `/p/<code>` short links and `/go/<id>` affiliate redirect (deal cards link to the deal page; Buy Now keeps its existing attribution).
- **Hosting:** Hostinger managed Node.js, single app process, no Redis available (the Redis URL is optional). WebSockets were not verified on this plan, so **Server-Sent Events** (plain HTTP) were chosen; they pass the existing CSP (`connect-src 'self'`).
- **Decision recorded:** any member can message any member (no request step, per owner decision). The old request flow (`REQUESTED/DECLINED`) is no longer used; conversations are created as `ACCEPTED`. Old rows keep working.

## 2. Database (additive only, both schemas and both migration trees)
Migration `20261124100000_profiles_messaging`:
- `ForumProfile`: `displayName`, `location`, `lastSeenAt`.
- `DmThread`: per-member `DeliveredAt`, `MutedAt`, `ArchivedAt`, `ClearedAt` (low/high side).
- `DmMessage`: `kind` (TEXT/DEAL/DISCUSSION), `refId`, `clientId` (unique with sender: a retried send is stored once).
- New `CustomerAppToken` (SHA-256 of the app token only).
No DROP, no data rewrite. Rollback: the new columns and table can be dropped after the code is rolled back; doing so loses only profile extras, mute/archive state and app sign-ins, not messages or accounts. Applied to the local development and test databases only.

## 3. APIs (all under `/api/v1`, same JSON shape `{data}` / `{error}`)
Profile: `GET community/profiles/{handle}?tab=`, `GET|PATCH customer/community/profile`, `GET customer/identity/available?handle=`, `POST|DELETE customer/identity/avatar` (existing).
Messaging: `GET|POST messages/threads`, `GET|PATCH|DELETE messages/threads/{id}`, `POST messages/threads/{id}/messages`, `POST .../read`, `POST .../typing`, `POST messages/delivered`, `GET messages/unread`, `GET messages/with/{handle}`, `GET messages/members?q=`, `GET messages/blocks`, `PUT|DELETE messages/blocks/{handle}`, `POST messages/reports`, `GET messages/stream` (live).
Native sign-in: `POST mobile/auth/login`, `GET|DELETE mobile/auth/session`.

## 4. Real-time design and its limits
- Transport: SSE. Events (`message`, `read`, `delivered`, `typing`, `thread`) are published **only after the database write succeeded**; the database is the source of truth. After every connect or reconnect the server sends `ready` and the client reloads from the API, so anything missed is recovered. Retried sends carry a device id, so duplicates are stored once.
- Several tabs/devices per member are supported (limit 6 connections). Each connection is authorized like any private endpoint (session cookie or app token) and receives only events addressed to that member.
- **Verified locally:** delivery to two sessions, no delivery to a third member, stream refused without credentials, cleanup on disconnect, reconnect recovery.
- **NOT verified:** behaviour behind the Hostinger proxy on staging (response buffering could delay events; the stream sends `X-Accel-Buffering: no` and a keep-alive every 20 s). If staging shows delays, fall back is the same API with the existing reload on `ready`; nothing else changes.
- **Single process only:** events are shared across server processes only when `REDIS_URL` is set (optional relay in `server/messages/bus.ts`). With more than one process and no Redis, a member connected to another process would not see live events until their next reload.
- "Online" means a live connection touched presence in the last 90 seconds.

## 5. Behaviour decisions to know
- Read receipts: the recipient's device calls `/read` only when the conversation is on screen in a visible, focused tab. Replying also marks earlier messages read. Opening the list or history never marks anything read.
- Delivered: set when a device receives the member's messages (connect or live message).
- Unread badge counts unread messages in conversations that are not muted or archived. Muted conversations still store and show messages but create no notification.
- One unread notification per conversation (new messages refresh it); `MESSAGE` notifications open `/messages?t=<thread>`.
- "Delete conversation" hides it for that member only (`ClearedAt`); the other member's history and all rows remain. No retention policy has been approved, so nothing is hard-deleted.
- Block: both directions refused on the server (send, start, typing), unblock only by the blocker, and the blocked member is not told who blocked them. Blocked pairs do not appear in member search.
- Reports copy the single reported message for staff at that moment; staff do not browse conversations. The admin queue for `DmReport` does not exist yet (reports are stored only).
- Links: max 2 per message; accounts younger than a day cannot send links.
- Messages are stored and shown as plain text (escaped by React); only safe https links are linkified. Attachments other than deal/discussion shares are not supported.

## 6. Screens
Public profile (`/community/u/{handle}`, also `/@{handle}`): banner, photo, names, bio, location, copyable link, real statistics, tabs Overview / Deals / Discussions / Comments / About, plus Saved (owner only). Edit Profile (`/account/profile`): photo with crop and zoom, display name, user name with live availability, bio, city/state. Inbox + chat (`/messages`): two panes from 768px, one full-screen pane on phones. Header Messages icon with badge, phone bottom bar (Home, Deals, Community, Inbox, Profile) hidden inside the native app.
Added afterwards (see section 9): Follow button, Verified member badge, push alerts (provider-gated), admin review of reported messages. Email alerts for messages are still not built.

## 7. Native apps
Bearer app tokens (`Authorization: Bearer mdt_...`) are accepted by every `customerApi` and community read route, need no `Origin` header, and ignore cookies; cookie requests keep the same-origin check. Tokens: 60 days, hash stored, up to 10 per member, revoked on sign-out and on password reset, refused for disabled accounts. The app must keep the token in Expo SecureStore. Later additions (section 9): refresh tokens, Google/Apple native sign-in, push registration. The Flutter app was not changed or tested.

## 8. Tests and checks (local, disposable MariaDB only)
- `tests/messages.test.ts` (start/send/ordering, duplicate protection, isolation by id, receipts, unread, mute, archive, delete-for-me, block both ways, report, shares, notifications, SSE over HTTP, connection limits, app tokens) and `tests/member-profile.test.ts` (public fields only, statistics, saved privacy, editing and name rules) pass.
- Full suite run file by file: 189 pass, 0 fail except tests that need a real Redis (7, `m11-queue-scheduler`, part of `m12.1`), 34 skipped by their own database switches.
- `tsc` clean; ESLint 0 errors.
- Layout: no horizontal overflow at 1440, 1280, 1024, 768, 430, 390 and 360 px on profile, edit profile, inbox and chat (measured, not screenshots). Real phones, keyboard behaviour and Safari were not tested.
- Not tested: staging, PostgreSQL run of the new migration (written, not executed), Playwright end to end, load.

## 9. Follow, verified badge, push, native sign-in, reported messages (added 14 Nov 2026)
Migration `20261125100000_follows_verified_push_refresh` (additive; both trees; applied to local databases only): `ForumMemberFollow`, `ForumProfile.verifiedAt/verifiedById`, `DevicePushToken`, and refresh columns on `CustomerAppToken`. Rollback: drop the new tables/columns after rolling the code back; this loses follows, badges, push registrations and app sign-ins only.

- **Follow:** `PUT|DELETE /api/v1/customer/community/follows/{handle}`. Repeat calls change nothing, no self-follow, blocked pairs cannot follow (a block also removes follows both ways). The profile shows follower/following counts only; who follows whom is not listed. No notification is sent for a follow.
- **Verified member:** a staff-granted flag (`forum:manage`, ADMIN and SUPER_ADMIN), with a mandatory reason kept in the moderation history. Members cannot set it and who granted it is never public. Admin screen: Community moderation, tab "Verified members" (`POST /api/v1/admin/community/members/{handle}/verify|unverify`). The badge shows on the profile and in the inbox/chat. The owner must decide what verification means (no checking procedure exists yet).
- **Reported messages (admin):** tab "Reported messages" in Community moderation. Staff see only the copied reported message, category, details and the two user names; open, resolve, dismiss and escalate with a note (escalated needs `forum:manage`), optional 7-day suspension of the sender. Everything is recorded in the moderation history and audit log. Conversations are never listed.
- **Refresh tokens:** access token 1 hour, refresh token 60 days, replaced on every use (`POST /api/v1/mobile/auth/refresh`). Presenting an old refresh token again ends the whole sign-in; two simultaneous refreshes cannot both win. Password reset, sign-out (access or refresh token) and a disabled account end the sign-in.
- **Google / Apple for the app:** `POST /api/v1/mobile/auth/google` and `/apple`. The app uses the provider's native SDK and sends the ID token; the server checks signature (provider public keys), issuer, audience, expiry, verified email and, for Apple, the nonce, then applies the same account rules as the website (one shared function). **Needs owner setup:** `GOOGLE_NATIVE_CLIENT_IDS` (Android/iOS/web client ids) and `APPLE_NATIVE_CLIENT_IDS` (the iOS bundle id); until set, both answer 503. Tested with locally generated keys only; never against Google or Apple.
- **Push alerts:** `POST|DELETE /api/v1/mobile/push-tokens` registers a phone. Sending uses Firebase Cloud Messaging (HTTP v1; reaches iPhones once an APNs key is added in Firebase). **Needs owner setup:** `FCM_PROJECT_ID` and `FCM_SERVICE_ACCOUNT_JSON`; without them nothing is sent and registration answers `delivery: not_configured`. Alerts are sent only for a stored message, not for muted conversations, and when the member has no open live connection on this server; the text is generic ("New message from <user>"), never the message. Tested with a mocked Firebase only: **no push has been sent to a real device.**

## Combined profile page (15 Nov 2026, local only)
- `/account` (signed in) is now the single member page: hero, six statistics, About Me, Account & Security, Personal Preferences, Activity Highlights, and tabs for My Deals (with the Post a Deal form), My Activity, Saved Deals, Notifications, Settings & Security (`?tab=`). `/profile`, `/account/profile` and `/community/me` redirect into it; a member's own `/community/u/<handle>` redirects to `/account` unless `?public=1` (the page other members see).
- Statistics (server, own rows only): submitted, approved, live (deal published now), views (stored view counter of those deals, each once), helpful votes (likes by others on own published posts and comments), badges = 0 (no badge rules exist).
- New additive migration `20261127100000_member_preferences_saved_deals`: `CustomerPreference` and `SavedDeal`. Applied to the local dev database and a disposable test database only. PostgreSQL copy written, not executed.
- New APIs (session or app token): `GET /api/v1/customer/dashboard`, `GET|PATCH /preferences`, `POST /password` (current password required), `GET|POST|DELETE /saved-deals`. Admin: `GET /api/v1/admin/moderation/members?q=` (invite type-ahead, user names only).
- Not built: member two-factor authentication, active session list (member sessions are stateless tokens), badges, account deletion/export, sending of deal-alert or digest emails (preferences are stored and ready for a sender).
