# Review of the uncommitted changes (13 Nov 2026, branch `seo/prelaunch`)

161 paths: 73 modified, 2 deleted, 86 new (untracked) entries. Nothing is committed or pushed. Nothing was staged by me.

## Findings first
- **Accidental secrets: none found.** 17 real secret values from the local env files were searched for in tracked and untracked (non-ignored) files and the production browser bundle: no match. Pattern scan (private keys, AWS, Stripe, GitHub, Google API keys, Slack) over all changed and untracked text files: no match. `staging/` (Apple key, cron secret, env) is git-ignored and absent from the list.
- **Unrelated files that must NOT be committed with this work:** `.agents/`, `.tmp_xlsx/`, `Final List.xlsx`, `Indian_DTC_Brand_Database_Cleaned.xlsx`, `amazonbacked.html`, `amazonbacked.txt` (2.4 MB saved page; mentions of "password/token/secret" are page text, not credentials), `prisma/.tmp_mariadb_before.prisma`, `prisma/.tmp_mariadb_diff.sql`, `skills-lock.json`. Suggest adding them to `.gitignore` or deleting after you have looked at them.
- **A schema drift item that is not ours:** Prisma reports `merchantwebsitedirectory.updatedAt` default differs between schema and database. It predates this work and no migration was written for it (harmless; flag only).
- **Migration 20261117 is not committed yet but is already applied on staging.** It must be committed together with the other five so the repository matches staging's history.

## Categories
| # | Category | Paths | Notes |
|---|---|---|---|
| 1 | Database migrations (additive, PostgreSQL and MariaDB twins) | 14 | `20261117_forum_post_views`, `20261118_forum_composer`, `20261119_analytics_visitor_key`, `20261120_customer_password_reset`, `20261121_forum_likes`, `20261122_forum_notifications`, `20261123_forum_announcements`. Only the last six are pending on staging. Future-dated names are intentional (see the tracker); do not rename. |
| 1b | Prisma schemas | 2 | Must be committed with the migrations. |
| 2 | Backend (API routes, services) | 26 | New: announcements, notifications, drafts, images, likes, discussions/overview/announcements read APIs, rich-text sanitizer. Changed: customer login (username or email, Remember me, forgot password), moderation (notices), analytics collector (visitor cookie). |
| 3 | Frontend | 39 | Community feed, composer, detail page, comments, bell, announcements pages, admin Announcements page, login/sign-up redesign, cookie settings. Deleted: `CommentSection.tsx`, `SubmitPost.tsx` (replaced). |
| 4 | Tests | 8 | 5 new files; 3 existing files gated so they only run on disposable databases. |
| 5 | Documentation | 12 | Includes `CLAUDE.md` (cross-platform standard). |
| 6 | Flutter app | 6 | Belongs to the separate mobile task; not needed for the web deploy. Commit separately. |
| 7 | Dependencies and build metadata | 3 | `package.json`/lock: tiptap (editor) and sanitize-html (+types). `tsconfig.tsbuildinfo` is generated noise: do not commit. |
| 8 | Generated Prisma clients (tracked in this repo) | 42 | Regenerated from the new schemas; commit with the schemas. |
| 9 | Scratch / unrelated | 9 | See above. |

## Migration dependencies
Order is by name (Prisma applies in that order): composer, visitor key, password reset, likes, notifications, announcements.
- All six are **additive only**: new nullable or defaulted columns, new tables, new indexes, new foreign keys. No `DROP`, no `DELETE`, no column type change, no data rewrite (checked by reading the SQL: only `ALTER TABLE ... ADD COLUMN`, `CREATE TABLE`, `CREATE INDEX`, `ADD CONSTRAINT`).
- Dependencies: composer, likes, notifications and announcements add foreign keys to tables created earlier (`ForumPost`, `ForumComment`, `ForumProfile`, `User`); password reset adds one to `Customer`; the visitor key migration touches `AnalyticsSession` only. None depends on another of the six.
- Existing data that could conflict: none (new unique indexes are on new tables, or on `(visitorKey, startedAt)` as a plain index).
- The new application code needs all six applied: it selects the new columns and tables. Deploying code first would break the community and analytics pages, so the order is backup, migrations, then deploy.

## Security risks in the changes (reviewed)
- New write endpoints use the existing same-origin check, session identity and rate limits; ownership is enforced on the server (tests pass).
- Rich text is sanitized on write and on read; pictures are re-encoded; drafts and notices are private to their owner; staff data never reaches public announcement responses.
- New cookie `md_vid` (180 days) only after analytics consent; stored hashed.
- Dependencies added: `@tiptap/*` (editor), `sanitize-html`; `npm audit` was clean at install time (0 vulnerabilities).
- Known residual risks: inline scripts still allowed by the CSP; JWT sessions cannot be revoked early (password reset does not sign out open sessions).

## Suggested commit grouping (when you authorize commits)
1. Migrations + schemas + generated clients.
2. Backend services and APIs (+ their tests).
3. Frontend (community, composer, announcements, bell) and the color-token additions.
4. Login/sign-up redesign, username sign-in, Remember me, password reset.
5. Analytics visitor cookie and cookie settings.
6. Documentation and `CLAUDE.md`.
7. Flutter app (separate).
Leave out the scratch files and `tsconfig.tsbuildinfo`.
