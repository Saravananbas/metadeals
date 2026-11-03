# M4 additive migration plan

Build on applied M3 without altering existing records. Add Merchant.affiliateHosts
(empty allowlist by default), AffiliateClick (deal/option/channel/time and daily
HMAC digest, no raw IP or referrer), and AffiliateTransaction (manual report entries,
provider/external ID uniqueness, reported status and integer commission paise).
Clicks are never treated as orders or confirmed commissions. New indexes bound
reporting queries. No network provider credential or live integration is required.

Redirect destinations come only from current published deal records and must match
the merchant's exact website hostname or an explicitly configured affiliate host.
No URL query parameter can supply a destination. Redis rate limits and bot/prefetch
checks reduce click inflation; reporting is not an audited fraud determination.
Reports are bounded and role protected. Transaction imports are idempotent; no
guessed provider API or commission rate. All external adapters default unsupported.

Review generated additive SQL, keep local backup and compare existing table counts
before/after. Apply locally using migrate deploy, never reset or db push.
