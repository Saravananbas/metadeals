# MetaDeals4U Community Forum — Product Plan

## Vision

Create an India-focused, Reddit-inspired shopping community in the existing MetaDeals4U product. Members can share deals and shopping knowledge, discuss categories, ask questions, and help one another assess whether an offer is useful. Forum publishing and official deal publishing must remain distinct: community contributions can be visible under forum moderation policy, while promotion onto the official MetaDeals deal catalogue continues through the existing administrator approval and publishing controls.

## Product principles

- Build into the existing Next.js application, authentication, PostgreSQL/Prisma data layer, admin portal, and design system. Do not create a second app or database.
- Make web APIs suitable for future Android and iOS clients. Keep UI-specific behavior out of business rules.
- Security, user privacy, abuse prevention, accessible mobile UX, and moderation are release gates.
- Show clearly when a post or link is user-submitted, affiliate-linked, sponsored, or an official MetaDeals listing.
- No fabricated engagement numbers, fake users, fake karma, or seeded public content that looks real.
- Keep profile data minimal. Sex/gender, date of birth, and precise location are not needed for a forum by default. Do not collect them unless the owner documents a real purpose and obtains appropriate advice/consent.

## Reference patterns

DesiDime’s posts page shows a useful pattern: distinct post types (Deal, Coupon, Discussion, Feedback), topic groups, store shortcuts, trending groups/discussions, recent posts, votes, comments, and user identities. MetaDeals can adapt these ideas into its own experience. It should not clone DesiDime’s language, art, visual design, taxonomies, or implementation.

## Information architecture

Suggested navigation:

- **Community** — personalized or general feed.
- **Deals** — community-shared deal posts, with a retailer link and clear status/price disclaimer.
- **Discussions** — questions, shopping advice, product comparisons, news, and general topics.
- **Categories / Communities** — topic spaces such as Electronics, Fashion, Home & Kitchen, Beauty, Travel, Finance, and Feedback.
- **Create post** — choose an allowed post type, then complete a type-specific form.
- **Search** — posts, communities, merchants, and authors, subject to privacy and moderation rules.
- **Notifications** — replies, mentions, moderation outcomes, and followed community activity where enabled.
- **Profile** — public display name, bio/avatar and public contribution history; private settings and personal data remain private.
- **My activity** — posts, comments, votes/saved items, moderation status, and account controls.
- **Moderator / Admin** — queues, reports, removals, locks, appeals, audit history, and community settings.

Use `community` routes/namespaces to avoid collisions with the existing official deals catalog. Exact route names are an implementation decision after route inventory. Candidate routes: `/community`, `/community/c/[slug]`, `/community/post/[id-or-slug]`, `/community/submit`, `/community/u/[handle]`.

## Post types and lifecycle

Initial post types:

1. **Deal** — title, canonical retailer URL, merchant, price, optional MRP/coupon, optional product image, relevant category, and submitter context. Deal post visibility in the community does not itself publish an official MetaDeals catalogue deal.
2. **Discussion** — title and body, community/category, optional links/images.
3. **Question** — title/body, community/category, optional accepted-answer marker as a later phase.
4. **Feedback** — route to an explicitly staffed feedback area; do not imply support response SLAs that do not exist.
5. **Coupon** — optional launch feature; only include if users can describe eligibility, expiry, and terms without implying guaranteed validity.

Suggested lifecycle: `DRAFT` (private) → `PUBLISHED` (visible) → optionally `LOCKED`, `REMOVED`, or `DELETED` (with audit/tombstone as appropriate). Some new accounts, suspected spam, external-link posts, or sensitive categories may enter `PENDING_REVIEW`. The policy must make this clear.

Official deal catalogue lifecycle remains separate: customer submission → admin review → approved draft → existing validation/preview/publish process. Do not let forum votes or popularity bypass official deal publishing authorization.

## Member features

### Feed and discovery

- Sort by **New**, **Top** (time window), and **Hot**. A personalized feed can follow in a later phase after the basics are safe and measurable.
- Filter by post type, community/category, merchant, and status where useful.
- Paginated or cursor-based feed; stable ordering and deduplicated posts.
- Post cards show type, title, author, community, timestamp, score, comment count, and clear deal/affiliate markers.
- Detail page supports direct URL sharing and canonical metadata.
- Search with bounded query length, rate limits, and safe handling of user text.

### Posting and discussion

- Authenticated, verified accounts only for writing, commenting, voting, and reporting.
- Public browsing may remain available without login, subject to privacy and anti-abuse limits.
- Markdown or a safe rich-text subset. Sanitize on input/output; reject scripts, unsafe HTML, dangerous URL schemes, and embedded arbitrary iframes.
- Nested replies: start with one or two reply levels or thread-collapse controls to preserve mobile readability; do not enable infinite nesting.
- Edit/delete own content with clear edit history/moderation policy. Keep audit records where needed; do not expose private deleted data publicly.
- Attachments: initially prefer no user upload or use the existing validated media pipeline with strict limits, content-type sniffing, image decoding/re-encoding, malware/abuse controls, authorization, and storage lifecycle. Never trust filename/MIME from the browser.
- Deal URL must be validated server-side (HTTPS; block localhost, private IPs, non-HTTP schemes, and unsafe redirects/SSRF) and normalized for duplicate detection. Do not scrape on every render.

### Voting, saves, follows, reputation

- One vote per account per target (post/comment), changed atomically; no anonymous vote identity based only on client input.
- Initial UI can support upvote/downvote or a simpler helpful vote. Decide one consistent model and define how score is computed.
- Save/bookmark is private to the account.
- Follow communities and optional post notifications.
- Avoid a public karma/reputation score at launch unless abuse controls, anti-gaming rules, and meaning are well-defined. If introduced, derive it from persisted events and exclude moderator/admin adjustments from user manipulation.

### Profiles and privacy

- Public profile should use a handle, optional avatar/bio, join date, and public posts/comments. Do not expose email, exact birth date, exact location, auth identity, internal moderation notes, or private submission data.
- Account dashboard may display own submitted-post counts/statuses from database records.
- Provide account export/correction/deletion request path consistent with applicable law and retention needs.
- Do not collect sex/gender or date of birth for community operation by default. Define child/minor access policy with counsel before enabling broad UGC.

### Notifications

- In-app notification center for replies, mentions, moderation results, and followed communities.
- Email/push notifications opt-in, with preferences, unsubscribe, and consent records where required.
- Prevent notification floods with per-user limits and digest options.

## Moderation and trust & safety

Must exist before public launch:

- Community rules and prohibited content: scams, phishing, personal data, harassment, hate, threats, illegal goods, impersonation, counterfeit claims, spam, referral abuse, manipulative affiliate links, and unsafe advice.
- Report post/comment/profile flow with categories and optional details.
- Admin/moderator queue with priority, assignment, reason, action, status, and audit event.
- Actions: approve/reject queued content; remove/restore; lock/unlock; warn; rate-limit; temporary suspension; disable account; escalate; mark duplicate/scam.
- User-visible reason and appeal/contact path for significant moderation action.
- Moderator actions must be permission-checked server-side and recorded immutably or append-only where feasible.
- Preserve evidence proportionately for abuse/investigation while applying a documented retention schedule.
- Clear distinction between community content and verified/official MetaDeals content.
- Anti-spam: verified email, per-account/IP/device-aware rate limits with privacy review, duplicate detection, link limits for new accounts, cooldowns, honeypot/CSRF protections, and anomaly monitoring. Avoid invasive fingerprinting without legal assessment.
- No automated AI moderation dependency for initial launch. If later adopted, it can triage but must not silently make high-impact decisions without defined review/appeal controls.

## Admin and moderator areas

- **Community overview:** new posts, comment volume, reports open, review backlog, removals, and service health. Metrics must be DB-backed; no sample numbers.
- **Content queue:** pending posts and reports, filters, safe content preview, reporter context only for authorized roles.
- **Post detail:** edit only through explicit audited moderation tools; do not silently rewrite user statements.
- **Actions:** approve, reject, remove, restore, lock, warn, suspend, dismiss report, escalate, and appeal outcome.
- **Policies:** community rules, allowed post types, rate limits, new-account restrictions, category configuration.
- **Audit:** actor, action, target, reason, time, correlation ID, and before/after metadata with sensitive data minimized.
- Apply least privilege: community moderators should not automatically gain access to billing, accounts, deal publishing, or infrastructure controls.

## Release phases and completion gates

### Phase 0 — Verify current implementation and product decisions

- Inspect the working tree, existing customer profile/submission code, route map, Prisma schemas, migration history, authentication, admin permissions, media storage, and legal pages.
- Classify each related feature as implemented, partial, unverified, or absent. Existing user changes are not assumed complete or safe.
- Confirm post types, anonymous browsing, pre-moderation rules, age policy, uploads, voting model, notifications, and moderator roles.

**Gate:** written inventory and no destructive changes.

### Phase 1 — Secure foundation

- Finalize community rules, privacy/retention, moderation roles, rate limits, audit semantics, abuse reporting, deletion/tombstone behavior, and mobile API conventions.
- Add/adjust additive PostgreSQL and MariaDB migrations only after reviewing existing uncommitted migrations for collisions. Validate on disposable databases first. Do not touch production/Hostinger.
- Add server-side authorization, ownership scoping, schema validation, URL safety/SSRF controls, output sanitization, CSRF/origin protections as applicable, and concurrency/idempotency protections.

**Gate:** authz, ownership, moderation audit, migration compatibility, and abuse tests pass.

### Phase 2 — MVP forum

- Community landing/feed, community page, post detail, create Deal/Discussion/Question, comments/replies, vote, save, follow community, profile public view/private activity, reporting, notifications (in-app only if reliable), responsive/mobile-friendly UI.
- Keep public official deal publishing and user-generated forum posts distinct.

**Gate:** complete real user workflows on desktop/mobile viewport, direct navigation, keyboard accessibility, database-backed counts, and no hardcoded examples.

### Phase 3 — Admin moderation

- Moderator inbox and report queue, review/actions, appeal path, granular permissions, audit views, alerts and safe operational tools.

**Gate:** moderators cannot access unrelated admin controls; state transitions and concurrent actions are tested.

### Phase 4 — Growth features

- Search, hot ranking, personalized feeds, badges/reputation, advanced deal duplicate checks, polls, collections, optional image handling, push/email notifications, Android/iOS clients using the stable API.

**Gate:** evidence that each feature can be operated and moderated safely; performance targets met.

## Non-functional targets

- Responsive from small mobile screens; accessible labels, focus states, contrast, keyboard navigation, and reduced motion support.
- API contracts versioned under existing `/api/v1` convention and independent of React UI.
- Feed uses bounded pagination, selected fields, indexed queries, and no N+1 calls.
- Avoid expensive synchronous work in request handlers; use existing queues only after checking current infrastructure and operational hosting constraints.
- Add request IDs, structured logs, privacy-conscious metrics, error boundaries, and basic abuse alerts.
- Define and measure p95 latency, error rates, queue age, report backlog, and moderation response targets before launch.

## Key product decisions for owner

Claude should inspect existing code and document these as open decisions rather than invent answers:

1. Should browsing be anonymous while posting/voting/reporting require verified login? Recommended: yes.
2. Which post types are in MVP? Recommended: Deal, Discussion, Question; delay Coupon/Feedback until policies and workflows are ready.
3. Are all posts immediately visible, or are some queued? Recommended: trusted/verified users may post under rate limits; new accounts/high-risk links can be queued. Owner must approve policy.
4. Are images permitted in community posts/comments? Recommended: defer until secure upload, moderation, storage, and takedown are ready.
5. Which moderators can remove content, suspend users, or approve official deals? Recommended: separate permissions and roles.
6. How are children/minors handled? Needs Indian counsel review before launch.
7. Do member deal posts receive affiliate conversion? If yes, explain affiliate rewriting/tracking transparently and obtain appropriate legal review.
