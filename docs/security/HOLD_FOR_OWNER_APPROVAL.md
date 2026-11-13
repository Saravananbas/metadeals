# Approval list (updated after the second remediation round)

> The 12-item launch status is in `PRODUCTION_LAUNCH_TRACKER.md`; this file lists the owner decisions.

Classes: **A** fixed and independently verified. **B** implemented locally, waiting for staging validation. **C** prepared, waiting for the owner. **D** needs a business or legal decision. **E** needs more technical investigation.

Evidence labels: *local test* = automated test on this PC. *review* = a fresh read-only reviewer agent, never the author. *not verified* = nothing was observed on the real host.

## What still needs the owner

| # | Class | What you need to do | Why it cannot be done without you |
|---|---|---|---|
| 12 | C | Say "deploy the security branch to staging" when the Hostinger connection works | Deployment |
| 2 | C | In hPanel create a runtime database user with only SELECT, INSERT, UPDATE, DELETE; check whether the plan allows per-privilege grants (class E for that one question) | Production-type database permission change |
| 4 | C | Rotate the staging database password (`INFRASTRUCTURE_RUNBOOKS.md` section 10) | Credential rotation |
| 5 | C | Replace the staging cron secret (section 11) | Credential rotation |
| 3 | C | Delete the Remote MySQL rules, last (section 9) | Hosting change; needs live Hostinger access |
| 13 | C | Set `ADMIN_ALLOWED_IPS` in production once it exists, with a second trusted location (section 12) | Production configuration; lockout risk |
| 15 | D | Choose account-deletion option A, B or C and the retention periods with your legal adviser (`DATA_RETENTION_AND_DELETION_PROPOSAL.md`) | Business and legal decision; affects customer data |

Everything else is either finished (A) or only needs a staging deploy and the checks in `STAGING_DEPLOYMENT_CHECKLIST.md` (B).

## All 15 original items

| # | Item | Class | Evidence | What is left |
|---|---|---|---|---|
| 1 | Content Security Policy | B | `CSP_MODE=enforce` builds an enforcing policy; local production build with it enforced: home, a deal page (inline JSON-LD runs) and the sign-in page showed 0 violations and images loaded; unit test for both modes. Review: nothing the app loads is blocked | Staging: YouTube embed, Google/Apple sign-in, every page with the console open; then production. Policy still allows inline scripts |
| 2 | Least-privilege database user | C (and E for hPanel) | Local test: a SELECT/INSERT/UPDATE/DELETE-only user was refused `CREATE`/`DROP` and the whole DB test suite passed as that user (204 of 212; the rest need Redis or Docker) | Owner creates the user in hPanel; unknown whether the plan allows it |
| 3 | Remote MySQL rules | C | Procedure written; **not verified** (could not read the rules) | Owner, last |
| 4 | Staging DB password | C | Exposure verified from this project's history: printed once to a terminal; not in Git; differs from the repository's test passwords (hash compare) | Owner rotates |
| 5 | Staging cron secret | C | Exposure verified: appeared in screenshots and a local file; endpoint works (HTTP 200 with the secret) | Owner rotates |
| 6 | Customer login lockout | A | 4 database tests (attacker cannot lock the real customer; address flood stopped; unknown email looks like a wrong password; 60 attempts from one address do not lock the victim). Two reviews; their findings (counter order, IPv6 /64, cleanup) fixed. Global counters removed | Residual risk below |
| 7 | Guest comment names | A | Unit test covers digits, symbols, Cyrillic/Greek look-alikes, zero-width and accent tricks, spaced letters and Indian-script names; two reviews | The mobile API does not return the "Guest" tag |
| 8 | Click throttle and channels | B | Unit test: approved channels only, repeats not recorded, flood capped, redirect never blocked; review confirmed reconciliation does not use click rows | Staging: Cuelinks attribution in wrap mode, custom `?c=` tags now count as "web" |
| 9 | Telegram approval callback | A | 5 database tests (stored record required, stored price-error flag wins, scores from the database, single approval, rejection closes the offer, no key means no approval, future dates refused); two reviews | Feature is unused today; `registerPendingApproval` has no caller until Telegram buttons exist |
| 10 | Image download deadline | A | Unit test with a trickling server stops in about 0.4 s; review confirmed timers are cleared | 30 s total may fail on very slow hosts |
| 11 | Affiliate network redirects | B | 20 unit assertions: forwarding to strangers, other parameter names, path forms, double encoding, control characters, chaining, userinfo, single slash; normal wrapped link passes; reviews found 3 bypasses, all fixed | Staging: real Cuelinks wrapped links in wrap mode |
| 12 | Deployment | C | Branch pushed; package built; deploy blocked by the Hostinger tool timing out | Owner approval |
| 13 | `ADMIN_ALLOWED_IPS` in production | C | Logic tested (IPv4, IPv6 range, forged header, empty list); runbook with recovery path | Owner, after production exists |
| 14 | Hostinger proxy behaviour | B (E until observed) | Staff-only `/api/admin/network-check` shows what the app sees; exact test steps written; **not verified on Hostinger** | Run the steps on staging |
| 15 | Account deletion and retention | D | Proposal written; nothing implemented or deleted | Owner and legal adviser |

## Residual risks I could not remove
- **Login:** a determined attacker with about four or more different addresses can still lock one customer's password sign-in for 15 minutes, and can make about 30 password guesses per 15 minutes in total. That follows from the design. A stronger answer needs a challenge (for example a code to the customer's email) or trusted devices: a sign-in flow change you would need to approve.
- **CSP:** inline scripts are still allowed because Next.js needs them; enforcing it limits where resources load, not injected inline code.
- **Client address:** correct only if Hostinger appends or overwrites `x-forwarded-for` (item 14).

## Production blockers (unchanged until the above is done)
Items 2, 3, 4, 13 decided; staging checks in the checklist passed; a backup restored once; role and customer-isolation tests run with real sessions on staging.
