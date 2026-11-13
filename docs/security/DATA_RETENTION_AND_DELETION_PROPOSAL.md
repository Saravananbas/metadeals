# Technical proposal: account deletion and data retention

**Status: proposal only. Nothing is implemented and no customer record is deleted. No legal retention period is stated here: every period below is a decision for the owner and a lawyer.** India's Digital Personal Data Protection Act, 2023 and its Rules are the likely framework, and other laws (tax, accounting, consumer protection, IT Rules) may require keeping some data. This document does not say what they require.

## 1. What is stored today (from the schema)
| Data | Tables | Personal? | Notes |
|---|---|---|---|
| Customer account | `Customer` (name, email, password hash, verified/disabled times), `CustomerSignupChallenge`, `CustomerRateLimit` | Yes | Foreign keys use `Restrict`: a customer cannot be hard-deleted while referenced |
| Profile | `Customer` extras (sex, date of birth, location), `ForumProfile` (handle, bio, avatar) | Yes | Handle and avatar are public |
| Contributions | `CommunityDealSubmission`, `ForumPost`, `ForumComment`, votes, saves, follows, reports | Yes (linked to a profile) | Public once published; moderation history is append-only |
| Messages | `DmThread`, `DmMessage`, `DmBlock`, `DmReport` (service only, not live) | Yes | Reports keep a snapshot of the reported message |
| Analytics | `AnalyticsSession`, `AnalyticsEvent`, `AnalyticsDaily` | Linked to a customer only after consent | Raw rows are deleted after 90 days by the nightly job |
| Affiliate | `AffiliateClick` (anonymous daily hash), `AffiliateTransaction` | Not linked to a customer | Needed to reconcile commission |
| Security | `AuditEvent`, `ForumModerationAction`, `AuthSession` (staff) | Staff identity; some customer ids | Append-only through the API |
| Staff | `User`, TOTP secret, recovery codes | Yes | Separate from customers |

## 2. Options for account deletion (decision needed)
- **A. Anonymise in place (recommended technical default).** Replace name, email, password hash and profile fields with fixed placeholders, disable the account, set the public handle to `deleted-<random>` and remove the avatar. Keep rows so that foreign keys, vote counts and moderation history stay consistent. Reversible only from backup.
- **B. Hard delete.** Requires changing foreign keys from `Restrict` to `Cascade` or `SetNull` per table, which is a schema change and risks losing audit trails. Not recommended without legal advice on what must be kept.
- **C. Deactivate only.** Disable sign-in and hide the profile; keep everything. Fastest, but does not erase personal data.

Public contributions (posts, comments, submitted deals): choose per item **delete**, **keep with the handle replaced by "deleted"**, or **keep as is**. Decision needed.

## 3. Proposed flow (technical, once the options are chosen)
1. Customer asks from their profile page (or by email to the contact address). Require the signed-in session or an emailed code to prove it is them.
2. Create a `DeletionRequest` record (customer id, requested time, status, completed time). Needs a new table: **a schema change that needs your approval.**
3. A 7-day (period is a decision) cooling-off window; the customer can cancel.
4. A job performs the chosen option inside one transaction and writes an audit event with no personal data.
5. Send a confirmation email to the address before it is erased.
6. Export: a "download my data" endpoint (profile, submissions, posts, messages they sent) returns JSON to the signed-in customer only.

## 4. Retention items that need a decision
| Item | Why it matters | Decision needed |
|---|---|---|
| Affiliate transactions | Commission reconciliation and possibly tax records; they are not tied to a customer | Retention period and whether any field is personal |
| Click records | Statistics and fraud checks; anonymous daily hash | Period (they grow without limit today) |
| Audit log | Security evidence; contains staff ids and some customer ids | Period; whether customer ids are removed on deletion |
| Moderation history | Evidence for disputes | Period; keep after the account is deleted? |
| Raw analytics | Already 90 days in code | Confirm 90 days |
| Customer account after closure | Legal duties may require some data | Period, if any |
| Direct messages | Private; reported messages are kept as snapshots | Period for snapshots |
| Staff accounts | Removed when staff leave; audit entries stay | Policy |

## 5. Backups
Hostinger takes daily backups of the database. Backups cannot be edited, so a deleted customer's data stays in older backups until they expire. Proposed rule (owner to confirm the period): keep a short log of deletion requests (id and date only) and **re-apply them after any restore**. Ask Hostinger how long daily backups are kept and whether they are encrypted; neither is visible from the repository.

## 6. What I need from you
1. Choose option A, B or C for account deletion.
2. Decide the retention periods in section 4 with your legal adviser.
3. Approve the new `DeletionRequest` table and the deletion job (schema change).
Until then nothing in the application deletes customer data, and the Privacy Policy describes retention in general terms only.
