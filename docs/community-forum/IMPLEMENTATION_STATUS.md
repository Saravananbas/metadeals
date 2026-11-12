# Community forum: implementation status (MVP)

Status as of 14 November 2026. Everything below is **local only**: not committed, not deployed, nothing applied to Hostinger. The forum is **off unless `COMMUNITY_ENABLED=true`** (local `.env` has it on; `.env.example` and `.env.staging` do not).

## Decisions taken (conservative defaults; owner to confirm)

| Question in the plan | Default built |
|---|---|
| Anonymous browsing | Yes. Reading is public; posting, commenting, voting, saving, following and reporting need a verified, active, non-suspended customer |
| MVP post types | Deal, Discussion, Question. Coupon and Feedback are not built |
| Are posts reviewed first? | Posts publish immediately, except: a community marked "requires review", or a post with a link from an account younger than 24 h (`COMMUNITY_NEW_ACCOUNT_HOURS`) |
| Text format | **Plain text**, escaped on screen; only public HTTPS links become clickable (`rel="nofollow ugc noopener noreferrer"`). No HTML or markdown, so there is nothing to sanitise |
| Images / uploads | **Not built** (deferred until upload moderation and takedown exist) |
| Vote model | Up/down, one vote per member per post or comment, score = sum. No voting on your own content |
| Karma, badges, polls, notifications, search, hot ranking, user-created communities | **Not built** (deferred by the plan) |
| Moderator roles | Two new permissions, `forum:moderate` and `forum:manage`, given to SUPER_ADMIN and ADMIN only. **No separate MODERATOR role yet** (needs a role-enum migration); EDITOR has no forum rights |
| Affiliate on member deal posts | **No.** Links are labelled "shared by a member, not checked by MetaDeals4U" and are never wrapped or tracked |
| Children | No age-gate is added by the forum; it relies on the customer account policy. **Needs counsel** (see `docs/legal/README.md`) |
| Search-engine indexing | Pages carry `noindex` until the owner decides |

## What exists

- **Data**: 10 new tables in `prisma/schema.prisma` and `prisma/schema.mariadb.prisma`, additive migrations `20261114100000_community_forum` in both `prisma/migrations/` and `prisma/migrations_mariadb/`. Votes, saves, follows and reports have unique indexes; moderation history (`ForumModerationAction`) is append-only. The existing `CommunityDealSubmission` workflow is untouched and separate.
- **Server**: `src/server/community/` (`service.ts` member and public use cases, `moderation.ts` staff use cases, `config.ts` switches and retry helper, `http.ts` and `admin-http.ts` wrappers). Public responses are allow-listed DTOs; reports and moderation notes never reach them.
- **API** (versioned, usable by future apps): `/api/v1/community/*` (feed, communities, posts, comments, votes, saves, follows, reports, profiles), `/api/v1/customer/community/*` (own activity and public name), `/api/v1/admin/community/*` (queue, reports, post/comment actions, member suspension, communities).
- **Web**: `/community`, `/community/c/[slug]`, `/community/post/[slug]`, `/community/submit`, `/community/u/[handle]`, `/community/me`, and `/admin/community` (review queue, reports, communities).
- **Controls**: master switch `COMMUNITY_ENABLED`; kill switch `COMMUNITY_WRITES_DISABLED=true` (read-only); rate limits (5 posts/hour, 20/day, 30 comments/hour, 120 votes/hour, 10 reports/hour); duplicate-post and duplicate-link detection.
- **Reused**: customer session and account checks, the portable rate limiter, `isPublicHttpsUrl` and URL canonicalisation, the admin audit table, the admin nav and CSS patterns.

## Verification (what was actually run)

| Check | Result |
|---|---|
| `tests/community-forum.test.ts` (9 tests: anonymous vs write, posting and URL safety, review policy and permission matrix, ownership and no-leak checks, vote races, comment nesting, reports and atomic moderation, suspension and kill switch and "no official deal touched", feed pagination) | **Pass** on disposable MariaDB (`metadeals_test`) and disposable PostgreSQL (`metadeals_sub_test`) |
| Existing submissions and analytics tests, same databases | **Pass** (21 of 21 together) |
| Migrations from scratch on disposable PostgreSQL; schema diff afterwards | **Pass**, "No difference detected" |
| MariaDB migration applied to the local dev database only | Applied; only the known cosmetic `updatedAt` default drift remains |
| Typecheck, lint, `npm run build` | **Pass** |
| Browser (local): sign in, post, comment, vote, save, report, admin removal, tombstone for anonymous readers, direct URLs, mobile width | **Pass**; test data removed afterwards |
| Not done | Keyboard and screen-reader pass, query-plan and p95 measurements, load test, `npm run test` on the whole suite |

Run the DB-backed suites **one file at a time** (`--test-concurrency=1`); they share one database:

```bash
FORUM_TEST_DB=1 COMMUNITY_TEST_DB=1 ANALYTICS_TEST_DB=1 node --conditions=react-server --import tsx --test --test-concurrency=1 tests/community-forum.test.ts tests/community-submissions.test.ts tests/analytics.test.ts
```

`DATABASE_URL` must name a database containing "test" (the forum test empties all forum tables).

## Real bugs the tests found and fixed

- Customer login, sign-up and every rate-limited action used **PostgreSQL-only SQL**, so email sign-in **failed on MariaDB (and therefore staging)**. The limiter now works on both.
- Parallel requests from one member (for example several quick votes) could fail with MariaDB's "record changed since last read" error (code 1020). The limiter and the vote, comment and moderation transactions now retry that safely.

## Known limits and decisions left for the owner

1. Enabling on staging needs the migration applied there (needs your approval), `COMMUNITY_ENABLED=true`, at least one community created in the admin, and a redeploy.
2. The `/privacy`, Terms and Community Guidelines must name forum posts, public names and moderation before launch (`docs/legal/`). The legal package has not been reviewed by counsel.
3. A moderator role without deal or account powers (needs an enum migration), report-outcome messages to reporters, in-app notifications, search and "hot" ranking are the next steps.
4. Retention and deletion rules for posts, comments and reports are not yet written or automated.
5. "Official deals" menu link and a "Community" link in the main site header are not added; the community is reachable only by URL until you decide.
6. In-memory throttling of public reads resets on restart (fine for one Node instance).
