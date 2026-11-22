# MetaDeals4U release pipeline

**Rule: nothing reaches production without passing through staging first. Nobody edits production directly.**

| Branch | Site | How it deploys |
|---|---|---|
| `staging` | https://staging.metadeals4u.in | Every push to `staging` rebuilds staging automatically (Hostinger, about 2 minutes). |
| `main` | https://metadeals4u.in (production) | Every merge into `main` rebuilds production automatically. `main` accepts only a pull request whose CI run passed. |

## The normal flow
1. **Work on `staging`.** Commit and push to `staging` (or open a pull request into it). Never push to `main`.
2. **CI runs** on every push and pull request (`.github/workflows/ci.yml`): dependency audit (blocks on *critical* findings; high findings are listed but do not block, see `docs/security/PRODUCTION_LAUNCH_TRACKER.md`), schema checks, clean-database migrations, typecheck, lint, security tests, production build.
3. **Test on staging.** Open https://staging.metadeals4u.in (and `/admin`) on a computer and on a phone. Check the change itself, plus sign-in, a deal page and the home page.
4. **Promote:** open a pull request from `staging` into `main` and merge it with **Create a merge commit** once CI is green. Production rebuilds by itself.
5. **Check production:** open the live site and the pages you changed. Watch `/api/health/ready`.

## Changes that are not only code
- **Database changes (migrations).** Name a new migration so it sorts after the latest one in `prisma/migrations_mariadb`. Apply it to **staging first** and test. For production: take a backup, then follow the privilege runbook (add `CREATE, ALTER, INDEX` to the production database user, run `npx prisma migrate deploy` over SSH from a working folder that holds the Prisma CLI, check `migrate status`, remove the extra privileges, confirm with `SHOW GRANTS`). Never run SQL by hand on production. Never edit `_prisma_migrations`.
- **Settings (environment variables).** Change and test on staging first, then the same on production. Production settings live in `~/domains/metadeals4u.in/hbuilds/config/.env` on the server; each line must be `NAME='value'`, one per line, with a final newline. After a change, rebuild (a push to `main`, or Redeploy). Secrets never go into Git or chat.
- **Hostinger or DNS changes.** Do them on staging when the feature exists there, and write the change in the pull request.

## When something must go out fast
Still through staging: push to `staging`, wait for the rebuild (about 2 minutes), check it, open the pull request, merge. There is no shortcut around staging. If GitHub protection ever has to be switched off in an emergency, only the owner does it, and the change is brought back into `staging` the same day.

## Rolling back production
1. Revert the merge on `staging` (`git revert -m 1 <merge commit>`), push, test, and promote the revert the normal way.
2. Hostinger keeps earlier builds under `hbuilds/versions` on the server if a build itself is broken.
3. A migration is not undone by a revert: restore the backup taken before it, then fix forward.

## Who may do what
- The owner and the assistant both follow the same rule. The assistant never pushes to `main`, never edits production files, settings or the production database, and never presses Redeploy on production, except as the explicit last step of a promotion the owner asked for.
- Privilege changes on the production database user are made by the owner in hPanel at the agreed moment and put back right after.

## One-time GitHub settings that make this rule enforceable
Repository → Settings → Branches → rule for `main`:
- Require a pull request before merging (0 approvals is fine for a single owner).
- Require status checks to pass before merging: **Typecheck, schema validation, and lint**.
- Do not allow bypassing the above settings (include administrators).
- Block force pushes. Restrict deletions.
