# Analytics metric definitions

All figures come from the existing tables (`AnalyticsEvent`, `AnalyticsSession`, `AnalyticsDaily`, `AffiliateClick`, `AffiliateTransaction`). The dashboard reads them; it writes nothing and adds no tracking. All dates are Indian Standard Time (IST) calendar days. A range is compared with the previous range of the same length; if that range has no data the card says "no earlier data" instead of a percentage.

| Metric | Definition |
|---|---|
| Page views | `PAGE_VIEW` events (crawlers, prefetch, `/admin`, `/api` are never recorded). |
| Visitors (per day) | Distinct cookie-free daily visitor hashes on page views, summed per range. Not a person count across days. |
| Unique visitors (accepted) | Distinct long-lived visitor codes in sessions of people who accepted analytics. |
| Accepted sessions | `AnalyticsSession` rows (created only after consent; 30 minutes idle ends a session). |
| Avg. time on site | Average active seconds per accepted session (heartbeats while the tab is visible). |
| Pages / session | Average `pageCount` of accepted sessions. |
| Bounce rate | Accepted sessions with 1 page or fewer. |
| New / returning visitors | Distinct visitor codes with a session marked new / returning in the range (one person can be in both). |
| Deal views | Page views of deal pages. Deal visitors = distinct daily hashes on those views. |
| Buy Now clicks | `BUY_CLICK` events, written by the `/go/` redirect. Older clicks recorded before that event existed are only in `AffiliateClick`. |
| CTR | Buy Now clicks / deal page views. For sources: clicks per accepted session. |
| Affiliate outbound clicks | `AffiliateClick` rows (every outbound redirect, consent or not). Used on the Revenue tab. |
| Likes, shares, comment opens, coupon copies, popup opens | `LIKE`, `SHARE`, `COMMENT`, `COUPON_COPY`, `MODAL_OPEN` events. |
| Discussions / comments created | Published `ForumPost` / `ForumComment` rows created in the range. Discussion views, comments and likes in tables are all-time counters. |
| Commission | `AffiliateTransaction.commissionMinor` (paise) by `reportedAt`. Approved = `APPROVED` or `PAID`; pending = `PENDING`; rejected = `REJECTED`. Only rows that were entered or imported; nothing is estimated. |
| Earnings per click | Approved commission / outbound clicks in the same range. |
| Order value | Not stored in transactions, so shown as "n/a". |
| Source classes | From the referrer host and the `?c=` channel: Telegram, WhatsApp, Search (google, bing, duckduckgo, yahoo, ecosia, baidu, yandex, brave), Social, Other referral. No referrer and no channel is "Direct / unknown", which also contains in-site navigation (the referrer is only sent on the first page of a visit). |
| Funnel | Visitors, then visitors who viewed a deal, then visitors who clicked Buy Now, then approved or paid transactions reported in the range (a different unit, not a strict subset). |

Retention: raw events are kept 90 days; days older than that have totals only (Overview line chart). Other tabs show no detail for those days and say so.

Privacy: no IP addresses or user agents are stored. Visits show only "Anonymous" or the member's first name (members are linked only when they accepted analytics). CSV exports contain no visitor identifiers; text cells that start with `=`, `+`, `-` or `@` are prefixed so spreadsheets do not run them as formulas.
