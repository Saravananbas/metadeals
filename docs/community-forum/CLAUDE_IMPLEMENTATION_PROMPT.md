# Claude Code Prompt — MetaDeals4U Reddit-Inspired Community Forum

You are working as a senior product engineer and application security engineer in the existing MetaDeals4U repository at `D:\Metadeals`. Implement the forum only after verifying the repository state and the plan documents below.

## Read first

1. `AGENTS.md` and all relevant nested `AGENTS.md` files.
2. `docs/community-forum/README.md`.
3. `docs/community-forum/PRODUCT_PLAN.md`.
4. `docs/community-forum/TECHNICAL_ARCHITECTURE.md`.
5. `git status --short`, branch status, diffs (staged and unstaged), and untracked files.
6. Existing customer auth/profile/submission code, admin review and permission model, Prisma PostgreSQL and MariaDB schemas/migrations, existing Next.js routes, media service, design tokens/components, tests, and deployment constraints.
7. Before editing any Next.js code, read the relevant local guide under `node_modules/next/dist/docs/`; this repository’s `AGENTS.md` states that this Next.js version has breaking changes.

## Product and codebase facts

This must be an extension of the existing application, not a new app, auth system, or database. Preserve the current deal catalog, Cuelinks V3, affiliate/outbound tracking, existing extraction, existing UI patterns, and Agent 3 shadow-only restriction. Do not reintroduce paid AI extraction. Do not deploy, push, commit, or change Hostinger/production.

The repository may already contain uncommitted customer profile and deal-submission work, including a `CommunityDealSubmission` Prisma model, customer profile/submission APIs, a customer profile UI, and admin submission review. Inspect and verify all of it. Preserve it; do not overwrite, duplicate, silently reorganize, or claim it is production-ready. The customer deal-submission workflow is separate from general forum posts and comments. Do not modify overlapping files unless you have inspected their current diffs and can make a minimal, safe change that preserves the existing intent.

The working tree is known to contain substantial user changes and untracked files. Never run `git reset`, `git clean`, broad restore/checkout, mass formatting, staging, commit, or push. Do not print secret values. Do not delete user data or reset any database.

## Mission

Design and implement a secure, mobile-ready Reddit-inspired community inside MetaDeals4U. Use DesiDime’s public posts page only as a high-level feature reference: multiple post types, communities/groups, deal sharing, discussion, votes, comments, recent/trending content. Do not copy its text, visual assets, branding, or proprietary design.

Use the existing React/Next.js App Router, TypeScript, Auth.js/NextAuth customer sessions, Prisma, PostgreSQL/MariaDB compatibility requirements, current media pipeline, admin permission model, and design system. Core operations must be exposed through versioned APIs suitable for future Android/iOS clients; do not make React-only actions the only route to core business logic.

## Security-first rules

- Security is more important than feature completion. If a feature cannot be secured, leave it disabled and report why.
- Authentication is not authorization. Enforce ownership, active/verified account requirements, and specific moderator permissions on the server for every action.
- Use strict validation, bounded payload sizes, rate limiting, CSRF/origin protections consistent with the existing app, safe output DTOs, and concurrency-safe state changes.
- Never expose email, date of birth, sex/gender, exact location, private saved items, reports, moderation notes, or private submissions in public profile/feed responses.
- Do not add collection of sex/gender, DOB, precise location, or invasive fingerprinting for forum functionality. If existing profiles contain these fields, preserve current behavior and avoid leaking them.
- Sanitize any markdown/rich text and escape output. Reject scripts, unsafe HTML, unsafe URL schemes, embedded arbitrary iframes, and SSRF targets (localhost, private/link-local IPs, credentials, weird IP encodings, unsafe redirects). Do not fetch user URLs synchronously in feed rendering.
- If safe image upload/moderation is not already implemented for this use, defer user uploads and report the blocker. Never trust client filenames or MIME headers.
- Persist votes/reports/actions as the source of truth; enforce uniqueness and race safety in the database.
- Moderation state transitions and their audit records must be atomic. Moderator permissions must not grant deal-publishing/admin account/infrastructure privileges by default.
- A forum post or its votes must never publish or modify visibility of an official deal. Customer-submitted deals stay in their existing admin review and normal draft/preview/publish workflow.
- No hardcoded sample posts, metrics, fake accounts, fake popularity, or test data visible as real content.

## Preservation and migration rules

- Before touching a file, inspect whether it is already modified and read the relevant diff. Avoid overlapping edits where intent is unclear.
- Additive migrations only. Do not edit migration history, reset databases, delete data, or change production configuration.
- Inspect all existing uncommitted Prisma migration folders first to avoid migration-name/content collisions.
- Validate migrations on disposable PostgreSQL and MariaDB databases. The owner has authorized additive migration work for local Docker development, but explicitly has not authorized Hostinger/production access or changes. Do not apply to Hostinger or production. Do not apply to a persistent DB without the authorized/local workflow and a backup/safety check.
- Maintain parity with both Prisma schemas if the app’s deployment path requires both. Document unavoidable provider differences.
- Do not upgrade dependencies unless a necessary, evidence-backed compatibility fix is approved by project policy.

## Implementation sequence

### 1. Audit and gap report

Inspect actual source and state. Produce a concise internal checklist of:
- What profile and user deal submission/review code already exists, its status, and risks.
- What general forum capabilities already exist or are missing.
- Conflicting/uncommitted files or migrations that make a safe change uncertain.
- Product decisions still needed (anonymous browsing, post types, whether first posts require moderation, attachments, vote model, moderator roles, minor policy).

Do not pause for questions that can be safely handled using documented defaults. Choose conservative defaults and record open product decisions.

### 2. Secure MVP foundation

Implement only the minimum complete MVP first:
- Public read-only community feed, community/topic pages, and post details.
- Authenticated verified customer creation of Deal, Discussion, and Question posts, subject to configurable review/rate-limit policy.
- Comments/replies with bounded nesting.
- One clearly defined vote model, private saves, follow community.
- Report post/comment/profile flow.
- User-owned activity view and public profile with only safe fields.
- Admin/moderator queue for reports and any queued content, with explicit least-privilege permissions, reasons, user-visible outcome, and audit history.
- Responsive accessible UI integrated into existing navigation/design system.
- Versioned APIs and shared server-side use cases usable by web and future native apps.

Do not add badges/karma, polls, arbitrary user-created subcommunities, image uploads, external search infrastructure, email/push notifications, or AI moderation until the MVP’s security, performance, legal/policy, and operations gates pass.

### 3. Data/API implementation

Follow `TECHNICAL_ARCHITECTURE.md`, but adapt names after verifying current schemas. Use DB constraints for unique votes/follows/saves and safe state transitions. Use cursor pagination and indexes. All public results must be allowlisted DTOs. Keep the existing `CommunityDealSubmission` model/workflow distinct and avoid duplicate structures.

### 4. Test and validate

Run relevant focused tests, then the project’s typecheck/lint/test/build commands as feasible. Do not claim success for commands that time out, are blocked, or were not run. Test at least:
- anonymous read vs forbidden writes;
- customer ownership and cross-account isolation;
- no private profile or moderation data leakage;
- vote replacement/duplicate races;
- duplicate post/report rate limits;
- safe URL and sanitization cases;
- moderation permission matrix and atomic audit;
- no forum path can publish an official deal;
- verified customer submissions still require existing admin approval and existing official publish validation;
- PostgreSQL and MariaDB additive migration validation using disposable databases;
- user workflows at mobile viewport and direct URLs.

Do not apply migrations to production/Hostinger. Do not deploy or push.

### 5. Report and checkpoint

At completion, report:
- Files changed/added and why.
- Existing user changes preserved and any overlaps left untouched.
- Implemented vs deferred scope.
- Tests/commands with exact pass/fail/blocked status.
- Database migrations created and which disposable databases they were validated against.
- Security limitations and features kept disabled.
- Remaining product/legal/operations decisions.
- Recommended next task.

If the repository already has an in-progress implementation from another session, verify it and continue from its actual state instead of rebuilding. Do not claim the forum is complete until real workflows and security tests pass.
