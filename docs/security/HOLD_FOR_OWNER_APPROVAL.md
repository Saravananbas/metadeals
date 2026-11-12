# Items held for the owner's approval

Nothing here has been done. Each item needs your decision because it touches production, credentials, customer data, sign-in behaviour or downtime.

| # | Item | Severity | Business impact | Proposed action | Why approval is needed |
|---|---|---|---|---|---|
| 1 | **Enforce the Content Security Policy** (today it ships as Report-Only) | Medium | Limits the damage if any script injection exists. A wrong policy can break Google/Apple sign-in, YouTube or images. | Deploy to staging, browse every page with the console open, fix any reported violation, then switch the header from Report-Only to enforcing. | Can break the live site. Needs a staging trial. |
| 2 | **Least-privilege database user** | Medium | Today one database user probably runs both the app and migrations, so an injection bug could alter tables. | In hPanel create a runtime user with SELECT, INSERT, UPDATE, DELETE only, keep the current user for migrations, point `DATABASE_URL` at the runtime user, redeploy. | Production database permission change and a config change. |
| 3 | **Remove Remote MySQL access rules** | Medium | Open database access from home addresses stays a risk. | Delete the Remote MySQL rules in hPanel when no migration is pending; re-add only when needed. | Production hosting change. |
| 4 | **Change the staging database password** | Medium | The password was printed once to a terminal earlier in the project. | Create a new password in hPanel, update `DATABASE_URL` in Environment variables, redeploy. | Credential rotation and downtime of a few minutes. |
| 5 | **Replace the staging cron secret** | Low | The secret appeared in screenshots shared with the assistant. | Generate a new value, update the environment variable and the cron command together. | Credential rotation. |
| 6 | **Customer login lockout redesign** | Low | Anyone can lock one customer, or all customers, out of password sign-in for 15 minutes. | Key limits on address plus email and count failures only; consider a challenge instead of a hard lock. | Changes the sign-in flow. |
| 7 | **Guest comment names** | Low | A guest can post as "MetaDeals4U Staff". | Label guest comments "Guest" or reject reserved names. | Product decision. |
| 8 | **Click throttle and channel allowlist on `/go`** | Low | Click statistics can be inflated and the table can grow. | Per-visitor limit and a fixed list of channels (web, telegram, whatsapp). | Changes how affiliate clicks are counted, which affects commission reconciliation. |
| 9 | **Telegram approval callback hardening** | Low | Only matters if the Telegram webhook secret is known to someone. | Read the assessment from the database, use a separate signing key, widen the replay window. | Touches the automated publishing path. |
| 10 | **Overall deadline for image downloads** | Low | A hostile image server can hold a request open. | Add a total time limit in the shared safe fetcher. | Shared security-critical code; needs careful review. |
| 11 | **Affiliate network `url=` redirects** | Low | An admin with the right permission could aim a `/go` link anywhere through an affiliate network address. | Require the inner `url=` target to also pass the allowlist. | Changes how affiliate links are validated. |
| 12 | **Deploying this work to staging or production** | n/a | Gets the fixes live. | Push the branch, deploy to staging, test the admin lock from mobile data, test an avatar upload, then decide on production. | Deployment. |
| 13 | **Set `ADMIN_ALLOWED_IPS` in production** | Medium | Without it the admin portal is open to the internet (behind login and MFA). | Add the variable in the production environment and test from outside. | Production configuration; risk of locking yourself out. |
| 14 | **Hostinger front-proxy facts** | Medium | The IP rules assume the proxy appends the real address last. | Verify as described in `NEEDS-VALIDATION.md`. | Needs the live host. |
| 15 | **Account deletion and data-retention process** | Medium | No customer or staff deletion route exists; retention periods are documented but not enforced beyond the analytics rollup. | Decide retention periods and add a deletion flow with legal review. | Affects customer data and has legal implications. |

## Credentials to rotate (names only)
- Staging `DATABASE_URL` password (printed once in a terminal).
- `ANALYTICS_CRON_SECRET` (shown in screenshots).
- Review: Google client secret, Apple client secret/key, `AUTH_SESSION_SECRET`, `NEXTAUTH_SECRET`, `AUTH_TOTP_ENCRYPTION_KEY`, Cuelinks key and YouTube key. **No evidence was found that any of these was committed to Git** (tracked files and history were scanned for key patterns and secret-like file names). They live in the Hostinger environment and your local `staging/` folder, which Git ignores. Rotate only if you believe they were shared.
- The local backup at `~/backups/metadeals-pre-audit-*.tar.gz` contains your `.env` and `staging/` secrets: keep it private or delete it when you no longer need it.
