# Community Moderator — Phase 1 Audit and Implementation Plan

Audit date: 2026-11-14  
Scope: read-only source/schema review. No moderator code or database changes have been made in this phase. Runtime follow-up verified the existing Next launcher on port 4123 and healthy local Python extractor; the initial sandbox loopback limitation is not evidence that the app was stopped.

## Existing system verified

| Area | Existing implementation | Status / gap |
|---|---|---|
| Authentication | Staff `User` with password, TOTP, recovery codes and `AuthSession`; customers use a separate Auth.js/NextAuth `Customer` identity/session. Staff context rechecks active status and MFA. | Strong staff security foundation, but member identity and staff identity are not linked. An invitation must not rely on email matching alone. |
| Staff roles | `SUPER_ADMIN`, `ADMIN`, `EDITOR`; server permission map in `src/server/auth/permissions.ts`. | No `COMMUNITY_MODERATOR`. Existing `forum:moderate` and `forum:manage` grants are broad for both SUPER_ADMIN and ADMIN. |
| Admin provisioning | Existing admin accounts API and setup/TOTP flow. | Must inspect full provisioning/token flow before adding a role; don’t reuse broad account creation in a way that permits self-promotion. |
| Customer profile | `Customer` and `ForumProfile`; the latter has public handle/profile fields plus active/suspended state. | No moderator appointment, invitation, probation, guideline acceptance, warnings, restrictions, or appeal records. Profile location exists and must remain private unless explicitly public. |
| Posts/comments | `ForumPost` and `ForumComment` support pending, published, removed and deleted states; version columns and author/community relations exist. Public service has published-state filtering. | Recoverable removal already exists. Add explicit sensitive-content pathway and verify every public/search/mobile/profile query filters hidden/removed material. |
| Community deals | `CommunityDealSubmission` is separate from forum posts. Review can approve to an ordinary DRAFT deal; normal deal preview/publish remains separate. | Review currently requires `deal:publish`, which is excessive for a moderator. A moderator-specific capability must not grant live deal publication. |
| Reports | `ForumReport` supports OPEN, RESOLVED, DISMISSED, ESCALATED, versioning, report details and staff resolver. | No assigned moderator, restricted evidence, appeal relation, or moderator-safe reporter disclosure policy. Existing status can be extended without creating a second report table. |
| Moderation/audit | `ForumModerationAction` is append-only and moderation service writes it with `AuditEvent` transactionally. Actions use staff `User` actors. | Good base for immutable audit. Current service gates with broad permissions; member suspension is indefinite or up to 365 days, too broad for moderator policy. |
| Notifications | Existing `ForumNotification` and moderation notifications to affected members. | Reuse for member outcomes/admin escalations; do not reveal moderator identity or sensitive report contents. |
| Admin UI/routes | Community dashboard has queue/reports/community controls; submissions review is separate. Multiple `/api/v1/admin/community/*` handlers call services. | Admin layout currently admits roles with `deal:edit` or `account:read`; a moderator must not pass that general layout. Create a separate narrowly guarded dashboard and APIs. |
| Uploads | Existing `src/server/storage/media.ts` uses normalized media storage; forum post images are associated with posts. | Before allowing moderator evidence access, inspect media route authorization and retention. Never expose sensitive evidence through public media URLs. |
| Database | Both PostgreSQL and MariaDB Prisma schemas/history remain in the repository, but owner clarified that the active runtime is MariaDB and Docker/PostgreSQL are no longer used. `.env` selects `mysql:` on local port 3307; `prisma.config.ts` selects the MariaDB schema and migration tree. | Target moderator implementation and validation at MariaDB. Preserve legacy PostgreSQL files; do not remove them without explicit direction. Validate additive migration changes on a disposable MariaDB database only. No schema writes performed. |

### Source map reviewed

- Staff authentication/session: `src/server/auth/session.ts`, `src/server/auth/service.ts`, `src/server/auth/authorization.ts`, `src/app/api/admin/accounts/route.ts`, `src/app/admin/components/auth-forms.tsx`.
- Role/permissions and current guard boundaries: `src/server/auth/permissions.ts`, `src/app/admin/(protected)/layout.tsx`, `src/app/admin/(protected)/community/page.tsx`, `src/app/admin/(protected)/submissions/page.tsx`.
- Customer identity/profile/submissions: `prisma/schema.prisma` (`Customer`, `ForumProfile`, `CommunityDealSubmission`), `src/server/customer/profile.ts`, `src/server/customer/submissions.ts`, and `/api/v1/customer/*`.
- Community moderation and UI: `src/server/community/moderation.ts`, `src/server/community/review.ts`, `src/app/admin/(protected)/community/CommunityModeration.tsx`, `src/app/admin/(protected)/submissions/SubmissionsReview.tsx`, `src/app/api/v1/admin/community/*`.
- Content, report, audit and media models: `prisma/schema.prisma` (`ForumPost`, `ForumComment`, `ForumReport`, `ForumModerationAction`, `AuditEvent`, `ForumNotification`, `ForumPostImage`); `src/app/api/v1/media/[id]/route.ts`; customer submission image routes under `/api/v1/customer/submissions/[id]/image`.
- Existing regression coverage: `tests/community-forum.test.ts`, `tests/community-submissions.test.ts`, `tests/community-announcements.test.ts`, `tests/member-profile.test.ts`, and `tests/messages.test.ts`.

### Call-site and migration collision audit

- `forum:moderate` gates the current community page, queue/report reads, post actions, comment actions, report resolutions, and is granted to both SUPER_ADMIN and ADMIN.
- `forum:manage` gates community configuration, member suspension, and escalated report review; also granted to both SUPER_ADMIN and ADMIN.
- `deal:publish` gates `/admin/submissions`, its review service (including approval/rejection and submission image access), official deal publishing, and distribution publishing. Do not repurpose this permission for moderators.
- `src/app/admin/(protected)/layout.tsx` currently permits any role with `deal:edit` or `account:read`. The moderator dashboard needs a route group outside this generic protected layout, or that layout must support a narrow exception without granting its other child routes.
- The two schema files are `prisma/schema.prisma` and `prisma/schema.mariadb.prisma`; the active configuration selects MariaDB. The current working tree contains local uncommitted migration directories through `20261124100000_profiles_messaging` in both migration trees. Proposed later migration timestamps/names must be rechecked immediately before creation; no migration was added here.
- Admin account provisioning maps every generated `UserRole` to a create permission (`src/app/api/admin/accounts/route.ts`), so extending the enum requires deliberate policy changes there and in the role assignment service (`src/server/auth/service.ts`). A moderator must not be creatable by generic account creation alone.

## Key security findings

1. A moderator should be an explicit, separate staff authorization identity with mandatory TOTP, while remaining linked to the invited existing customer. Do not silently convert a customer session into a staff session or match identities by email alone.
2. `forum:moderate` currently includes approve, remove, restore, report handling and the moderation dashboard; `forum:manage` includes member suspension and community configuration. Those capabilities are too coarse for the requested probationary, least-privilege role.
3. Existing post/comment removal is recoverable and version-checked. Preserve that transaction pattern and audit+notification transaction behavior.
4. Existing member suspension must not be exposed to moderators. Add a separate time-bounded posting restriction model or equivalent with maximum seven days, scoped capabilities, expiry enforcement in every write path, and Admin override. Do not map this to `ForumProfile.status = SUSPENDED`.
5. Community submission review must be separated from official publication. Approval may create a DRAFT through the existing validation path; only existing `deal:publish` actors may publish it.
6. Sensitive-content evidence needs restricted access. The moderator queue can show a redacted preview, hide public content atomically, and escalate; never copy detected secrets into logs, notification bodies or audit metadata.
7. Moderator appeals must be adjudicated by an Admin/independent authorized reviewer and the original moderator must not decide their own action.

## Recommended implementation architecture

### Identity and appointment

- Add `COMMUNITY_MODERATOR` to the existing staff role enum, not a parallel auth system.
- Add an explicit nullable one-to-one link from staff `User` to the invited `Customer` (unique customer ID); create it only in the Admin invitation/acceptance workflow after the customer is authenticated. Email equality alone is not proof of identity.
- Add an appointment/invitation record with unique, hashed, expiring invitation token; invited customer, inviter, invitation status, reason, guideline version/acceptance time, probation dates/status, extension/revocation actors and reasons. Store no raw invitation token.
- Acceptance requires authenticated Customer session, current invitation ownership, unexpired/unrevoked invitation, guideline agreement and completed staff MFA setup. Grant `COMMUNITY_MODERATOR` only after those checks.
- Probation lasts 30 calendar days and never auto-confirms. Admin explicitly confirms, extends with a reason, or revokes. Revoke role and sessions immediately; preserve appointment/audit history.

### Permission boundaries

- Add narrowly scoped capabilities following existing permission conventions: moderator queue/read, post review/hide/restore, comment moderate, report read/resolve/escalate, community-submission review/flag, member warning, temporary posting restriction, own audit history, and Admin moderator management.
- The moderator role receives only allowed community capabilities. It gets no account, security, deal create/edit/publish/archive, merchant, category, affiliate, analytics/operations, community configuration, or unrestricted audit permission.
- Keep existing Admin/Super Admin powers. Migrate each existing service/API from broad `forum:moderate` to explicit action permissions. Preserve Admin Foundation access via its existing account permissions, not by allowing moderators through the general admin layout.
- Introduce a dedicated moderator route group/dashboard with an independent server auth guard; API handlers must enforce the same exact capabilities. Avoid relying on hidden buttons.

### Content, restrictions, evidence and appeal

- Reuse existing ForumPost/ForumComment status/version, ForumReport, ForumModerationAction, AuditEvent and ForumNotification. Add only missing relations/fields.
- Add report assignment and a sensitive priority flag/category. A sensitive action should atomically set content to non-public/removed, create action+audit, and notify Admin with a redacted reference.
- Use a new temporary posting restriction record by member + capability + start/expiry + reason + moderator + optional target/report. Enforce it centrally in discussion/deal-submission/comment/reply write services. Maximum seven days for moderators. Admin can revoke/override. Do not suspend account/profile from moderator actions.
- Add private member warning and appeal records. Appeals can target moderation actions, content, and restrictions. Ensure the original actor cannot resolve their own appeal.
- Review media serving before adding evidence preview/download. Default to no evidence access if the existing route cannot enforce staff authorization and a non-public storage key.

### Route and data flow

Admin Foundation → searches an existing customer → sends single-use invitation → customer authenticates and accepts → mandatory staff MFA setup → moderator has isolated dashboard → version-checked service mutation + moderation action + AuditEvent + notification in one transaction → member may appeal → Admin/independent reviewer decides.

## Work sequence and gates

1. **Complete route/data audit:** inspect all community read/write APIs (including generic catch-all and mobile APIs), media routes, admin provisioning/MFA setup, query filters and all existing migration collisions. Record direct file references in this audit.
2. **Permission matrix/tests first:** add a table-driven matrix for all roles/actions and identify every existing `forum:moderate`, `forum:manage`, and `deal:publish` call site. Ensure no moderator can reach the Admin/Foundation, affiliate, scraper or live deal endpoints.
3. **Schema:** make the smallest additive changes to the active MariaDB Prisma schema and migration tree. Review generated SQL and collisions. Validate on disposable MariaDB only before any persistent local application; preserve PostgreSQL compatibility files and do not touch production/Hostinger.
4. **Invitation/MFA/probation:** implement token hashing/expiry/one-time use, authenticated customer binding, MFA completion, admin decisions and immediate session revocation on revoke.
5. **Moderation services:** granular permissions, soft-hide/restore, restricted sensitive handling, temporary posting restrictions, warnings, appeals, exact audit and notifications. No permanent moderator-issued suspension.
6. **Dedicated dashboard/API:** implement responsive queue, community submissions, reports/sensitive escalation and own history without Admin Dashboard access.
7. **Validation:** unit/service permission matrix; invitation race/expiry/MFA; transaction/audit concurrency; hidden content non-leak across web/search/profile/mobile; restriction expiry and limits; appeal independence; no path can publish a deal; disposable MariaDB migration; mobile UI/API checks.
8. **Enable only after gates pass:** if secure evidence storage, identity binding, database migration validation, or enforcement coverage is incomplete, leave that capability hidden and API-denied, and document the blocker.

## State and limitations

- This audit is source/schema based only. No live browser, authenticated workflow or database connectivity verification has been completed in this session.
- `npm run dev` currently fails before Next.js starts because `scripts/dev-with-extractor.mjs` cannot reach the Python extractor health endpoint on `127.0.0.1:8765`; the local execution environment reports loopback socket access as forbidden. Do not treat that as proof the extractor itself is defective.
- Existing uncommitted and staged user work was preserved. No schema, migrations, database, or production environment was changed.
- Admin navigation lint/typecheck had passed at the preceding checkpoint; live browser verification remains blocked by the runtime limitation above.

## Implementation status update (2026-11-14, later)
The plan above has been implemented locally; see `MODERATOR_PHASE_2_IMPLEMENTATION.md` for what was built, exact PASS/NOT VERIFIED status and gates. Corrections to this audit: the runtime database is MariaDB (Docker/PostgreSQL are no longer used); the generic admin layout did not admit moderators because they hold neither `deal:edit` nor `account:read` (it also now redirects them to `/moderator`); `deal:publish` gating of community deal review was replaced by a dedicated `mod:submission:review` capability plus a draft-only creation path. All security gates in the plan were met and tested except those listed as NOT VERIFIED there (browser verification of the new screens, PostgreSQL migration execution). Migration `20261126100000_community_moderator` is validated on a disposable MariaDB only and is NOT applied to the persistent local database.
