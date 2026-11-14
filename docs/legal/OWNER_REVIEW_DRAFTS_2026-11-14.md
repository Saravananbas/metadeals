# Drafts for owner review (14 Nov 2026)

**Status: DRAFT. Nothing here is implemented or published.** I am not a lawyer. These drafts reflect common practice for an Indian consumer website (the Digital Personal Data Protection Act, 2023 and the IT Act) and the Apple and Google store rules. Have a lawyer read Parts A and B before launch. Items marked **[DECIDE]** need your answer.

---

## Part A. Account deletion and data retention policy (draft)

### A1. What happens when a member deletes their account
Recommended: **Option A, anonymise in place** (see `docs/security/DATA_RETENTION_AND_DELETION_PROPOSAL.md`).

1. Member taps **Delete my account** in Profile settings (website and both apps; both stores require it in the app). They confirm with their password or a code sent to their email.
2. Account is disabled at once and signed out everywhere. A **7-day cooling-off period** lets them cancel by signing in. **[DECIDE: 7 days OK?]**
3. After the period, in one transaction: name, email, password hash, date of birth, sex, location, bio and avatar are erased or replaced with placeholders; the public handle becomes `deleted-<random>`; push tokens, follows, saved items, notifications and sessions are deleted; analytics rows linked to the account are unlinked.
4. A confirmation is emailed before the email address is erased.
5. A "Download my data" export (JSON) is available before deletion.

### A2. What happens to what they wrote
| Content | Proposed rule | **[DECIDE]** |
|---|---|---|
| Discussion posts and comments | Kept, shown as "Deleted member", unless the member chooses "delete my posts too" (then removed) | Default: keep or delete? |
| Deals they submitted that were published | Kept (the deal is public information), author removed | OK? |
| Votes, likes | Kept as anonymous counts | OK? |
| Direct messages | The member's own copy is erased. Messages already received by others remain with the other member, shown as from "Deleted member" | OK? |
| Reported messages (snapshots kept for abuse cases) | Kept for 12 months after the report is closed, then erased | Period? |

### A3. Retention periods (proposed)
| Data | Proposed period | Reason |
|---|---|---|
| Closed account: anything personal | Erased after the 7-day cooling-off | Request of the member |
| Raw analytics (page views, sessions) | 90 days (already in code) | Statistics only |
| Daily analytics totals | Kept, contain no personal data | Business statistics |
| Click records | 24 months, then deleted | Fraud checks, commission disputes |
| Affiliate transactions | 8 years | Accounting and tax records **[DECIDE with your accountant]** |
| Audit log | 24 months | Security evidence. Customer ids kept as opaque ids only |
| Moderation history (warnings, restrictions, appeals) | 24 months after the account is closed, then erased | Dispute evidence |
| Moderation escalations (hidden sensitive content record) | 12 months after resolved | Legal complaints |
| Staff and moderator accounts | Removed when they leave; audit entries stay | Accountability |
| Database backups | Daily backups roll off within the host's backup window; deletions are **re-applied after any restore** | Cannot edit backups |

### A4. Requests we must be able to handle
Access, correction, erasure, withdraw consent, grievance. A contact address and a reply time (suggest **30 days**) must be published. **[DECIDE: grievance contact name and email.]**

### A5. Engineering work needed (needs your approval; not started)
New `DeletionRequest` table (additive migration), the deletion job, the in-app delete screen, the data export endpoint, and the re-apply-after-restore log. About 2 days including tests. **[APPROVE: yes / no]**

---

## Part B. Privacy, Terms and Cookie pages: what to review

The three pages exist and were last updated on 13 Nov 2026 (`src/app/privacy`, `terms`, `cookies`). They are written in plain English and already cover: what we collect, anonymous counting versus consent-based analytics, store links and commission, community and messages, retention in general terms, security and age 18+.

Gaps against what was built since, to add after your approval:
1. **Profiles and following:** public handle, bio, avatar; who can follow; the verified badge meaning **[DECIDE: what "verified" means]**.
2. **Push notifications:** device token stored, how to turn off.
3. **Sign in with Google or Apple:** what we receive (name, email, provider id) and nothing else.
4. **Community moderators:** volunteers who can see reported content and warn or restrict members; they cannot see your email or publish deals; you can appeal.
5. **Restrictions and appeals:** posting can be paused for 1 to 7 days (moderators) or longer (administrators), with a reason and a right to appeal.
6. **Retention and deletion:** replace the general wording with the final table from Part A and add the in-app delete steps.
7. **Children:** keep 18+.
8. **Grievance officer** name, address and email (DPDP and IT Rules expect this).
9. **Terms:** user content licence (you may display what members post), prohibited content, moderator decisions, termination, governing law and courts in your city **[DECIDE: city]**, affiliate disclosure ("we may earn a commission").
10. **Cookie page:** list `md_sid` (analytics session, only after Accept), the login cookies, and the CSRF cookie. Match the banner wording.

I will turn the approved items into the final page text, show you the diff, and wait for your go-ahead before anything is published.

---

## Part C. Store-facing answers (prepare now)
- Privacy policy URL: `https://metadeals4u.in/privacy` (after go-live).
- Account deletion URL (Google asks for a web link as well as the in-app option): to add as `/account/delete`.
- Data safety / App privacy answers: name, email, user id, photos (avatar), user content, device id (push token), analytics (only with consent); data is encrypted in transit; users can request deletion.
- Content rules: report, block and moderate are built.
