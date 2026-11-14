# Community redesign (13 Nov 2026)

Enhancement of the existing Community module; no new forum, database or authentication.

## Why the page said "No posts yet"
The feed code was healthy. The **local development database genuinely has 0 posts** (2 members, 85 communities, 0 rows in `ForumPost`); staging has a post titled "Sample". Nothing is hidden by filters or moderation: only PUBLISHED posts in active communities are listed, and pending ones are visible only to their author. No dummy posts were added (test rows used for a screenshot were deleted again).

## What changed
- **Layout**: purple top bar (logo, Community, Deals, New discussion, search, avatar menu or Sign in); left column (Start New Discussion, All Discussions + Announcements, Deals Discussions, Help & Support, Feedback & Ideas, Off Topic / General with real counts; My Discussions, My Comments, Saved Posts, Following Topics with real counts); centre (hero, search, Latest / Trending / Most Liked / Most Commented / Unanswered, type chips Deals / Discussions / Questions, sort menu, cards, numbered pagination, premium empty state); right (Community Statistics, Trending Topics, Communities, Official announcements, Good to know).
- **Old filters kept**: "New" is Latest, "Top this week" is Trending (`?sort=top` links still work), Deals/Discussions/Questions are type chips, "Browse communities" is on the right.
- **Responsive**: desktop three columns; tablet (under 1100 px) sidebar plus feed with the right cards below; phone (under 760 px) one column with "Categories and my activity" folded behind a button. Checked at 390 px in the browser pane: no horizontal scroll.
- **Discussion cards**: avatar, name, time, category, type, title, 2-line preview, vote (existing voting), comments, views, bookmark (existing save API).
- **Detail page**: shows comments and views, counts a view, `#comments` anchor. **New discussion** form: preview button and the five general areas in the category list.
- **My Comments**: new "Your comments" section on `/community/me`.

## Data and backend
- Reused: `ForumPost`, `ForumComment`, `ForumPostVote`, `ForumSave`, `ForumFollow`, `ForumCommunity`, `ForumProfile`, `ForumReport`; same authentication and moderation.
- **Schema (additive migration `20261117100000_forum_post_views`, both providers)**: `ForumPost.viewCount INT NOT NULL DEFAULT 0` and two indexes `(status, commentCount, publishedAt)`, `(status, viewCount, publishedAt)`. No table dropped or rewritten; existing rows get 0 views. **Applied to the disposable `metadeals_test` and the local dev database only. Staging and production are not migrated; staging needs the migration run (owner approval) before it can use this build.**
- **Data rows, not schema**: the five general communities are created idempotently on first load (`CURATED_COMMUNITIES`); Announcements requires moderator review.
- `listDiscussions` (page-number pagination, `skip`/`take`, one count query), `communityOverview` (counts), `recordPostView` (one count per visitor and post per 6 hours using the existing counter table; bots ignored), `viewerHandle`. Search uses Prisma `contains` (parameterised), with `%`, `_` and `\` removed and a 80-character cap. New route `POST /api/v1/community/posts/[ref]/view`.
- Sorting rules: Latest = newest; Trending = last 7 days by score, then comments; Most Liked = score; Most Commented = comment count; Unanswered = zero comments; sort menu overrides (Most Recent, Oldest, Most Viewed). Trending topics = communities with most new posts in 14 days (no tag system).

## Tests run (disposable database `metadeals_test`)
- New `tests/community-discussions.test.ts` (run alone with `DISCUSSIONS_TEST_DB=1`, it empties the forum tables): filters, sorts, category, search incl. wildcard, paging, pending posts hidden, My/Saved/Following privacy between two customers, real statistics, view counting (once per visitor, bots ignored, hidden post 404) - pass.
- Existing `community-forum` (11), `community-submissions` (4), `admin-roles-routes` (3), `mobile-api`: pass, covering voting (one vote per member, change, concurrency), comments, reports, authorization and EDITOR/ADMIN rules.
- `tsc --noEmit` and eslint on changed files: clean. Browser pane at `localhost:4123` for desktop and 390 px.

## Not done / outstanding
- **Product image attachment on new discussions**: not implemented (needs a post image column, upload route and serving; a separate, reviewed change).
- **Notifications**: no notification system exists; the bell is omitted (documented future work). Blog and Help links are omitted because those routes do not exist; Categories is not a separate page.
- **Comment features**: replies, likes, edit, delete and report already existed and were not changed; "quote and reply" does not exist.
- Production build not run locally this round (dev server was running); the staging build will compile it. Not tested on real Android/iPhone browsers. Not deployed. Points, badges, leaderboards: not implemented, space left in the right column.
