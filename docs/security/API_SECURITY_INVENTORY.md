# API security inventory

Auth levels: none, customer session, staff session (+permission), shared secret. "Origin" = same-origin check on state-changing requests.

| Area | Routes | Auth | Notes |
|---|---|---|---|
| Public catalogue | `/api/v1/{catalog,deals,deals/[slug],home-deals,mobile/*}` | none | `publicWhere` hides drafts/expired; errors now generic |
| Deal counters | `/api/v1/deals/[slug]/{view,share}` | none | Now public deals only; share throttled per address (per process) |
| Deal comments | `/api/v1/deals/[slug]/comments` | none | 5 per hour per address; CORS `*`; guest names unchecked (held) |
| Media | `/api/v1/media/[id]` | none for public images, staff for others | `?w=320|640` only; immutable cache for public |
| Avatars | `/api/v1/avatars/[handle]` | none | Re-encoded 256 px WebP |
| Analytics | `/api/v1/analytics/collect` | none, Origin | Strict schema; address from shared helper |
| Affiliate | `/go/[dealId]` | none | Destination from database + host allowlist; click throttle held |
| Community reads | `/api/v1/community/*` GET | none/optional customer | Per-address throttle per process |
| Community writes | `/api/v1/community/*`, `/api/v1/customer/community/*` | customer, Origin | Strict zod schemas, per-profile rate limits |
| Customer | `/api/v1/customer/{profile,identity,identity/avatar,submissions,product-fetch,session}` | customer, Origin | Ownership in queries; uploads must declare size |
| Customer auth | `/api/auth/[...nextauth]`, `/api/v1/customer/[action]` | none | Limiters global/per email (lockout issue held) |
| Staff auth | `/api/auth/{login,logout,session,setup/*,password-reset/confirm}` | none (pre-auth), Origin | IP allow-list when configured |
| Staff admin | `/api/v1/admin/[...path]` | staff + per-branch permission, Origin | See permissions table in `AUTHENTICATION_AND_AUTHORIZATION.md` |
| Staff admin | `/api/admin/{accounts,accounts/[id],audit}` | staff + permission, Origin | No privilege escalation found |
| Staff admin | `/api/v1/admin/community/**` | staff `forum:*` | Version-locked updates, audit in same transaction |
| Staff admin | `/api/v1/admin/intelligence-controls` | staff; POST Origin, audited | Kill switch off needs `operations:read` |
| Machine | `/api/cron/analytics-rollup` | secret header (24+ chars, constant time) | Fails closed |
| Machine | `/api/telegram/webhook` | secret header + signed callback | Fails closed; feature unused |
| Health | `/api/health`, `/api/health/ready` | none | Status only |
| Pages | `/admin/**` | staff (layout and page guards) | Cuelinks page now needs `operations:read` |

Not exposed: direct-message routes do not exist yet (service only). No Server Actions are used. CORS headers are set only on the comment route.
