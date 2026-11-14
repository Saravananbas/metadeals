# Discussion detail page (13 Nov 2026)

Page: `/community/post/[slug]`. Same forum tables, voting, saves, reports and moderation; no second system.

## What it does
- **Breadcrumb** Community > category > title; **card** with the existing vote control, title, type and category badges, author, time, views, small picture thumbnails on the right (click to open full size), bookmark and a ⋯ menu.
- **Action bar:** Like (new), Reply (focuses the comment editor), Quote Reply (puts a quote block in the editor), Share (copy link, WhatsApp, the phone's share sheet), Save (the existing bookmark), More in category.
- **⋯ menu:** Edit Post (author, within 24 h, rich text), Report to Admin (everyone except the author; reasons come from the existing moderation categories; reporter stays private), Copy Link, Delete Post (author, with a confirmation).
- **Short links:** shared links are `/p/3fd33c` (a discussion) or `/p/3fd33c.a8021e9` (one comment), redirecting to the full address. Only published discussions are found; malformed codes go to the community page; the redirect never leaves the site. Older discussions without a random ending keep their full link.
- **Comments:** count, sort (Newest, Oldest, Most Liked, Most Upvoted), nested replies (two levels) with Hide/Show replies, per comment: upvote/downvote, Like, Reply, Quote, Share, ⋯ (Edit own within 24 h, Delete own, Report), "Author" badge for the discussion's author, rich-text composer (2,000 characters) with a "Replying to" chip, Post Comment and Cancel, skeletons, empty state, error and success toasts, optimistic like/vote with rollback.

## Data (additive migration `20261121100000_forum_likes`)
New tables `ForumPostLike` and `ForumCommentLike` (one per member and item, unique index), counters `likeCount` on posts and comments (maintained in the same transaction), `ForumComment.bodyHtml`, an index for sorting by likes. Votes stay in their own tables; a like never changes a score. Applied to local development and test databases only; **not applied to staging**.

## API
New: `PUT/DELETE /api/v1/community/posts/[ref]/like`, `PUT/DELETE /api/v1/community/comments/[id]/like`, `GET /p/[code]`. Changed: `GET .../posts/[ref]/comments?sort=&cursor=`, comment and post create/edit accept `bodyHtml` (sanitized server-side, plain text derived).

## Security
Server-side ownership on every edit, delete and like; rich text sanitized on write and on read; share links carry no private data; reports are private; same-origin and rate limits on all writes. Tests: `tests/community-likes.test.ts` (likes once, parallel duplicates, comment sorting, rich comments and quotes, customer A cannot edit or delete customer B's comment or post, edits do not create duplicate rows). With the other forum, composer, roles, analytics, recovery and security tests: 52 of 52 pass. Type check and lint clean.

## Not done / outstanding
- **Staff moderation inside the page:** ADMIN and EDITOR moderate in the admin portal (separate staff sign-in); the customer page shows no staff controls.
- **Notifications** (comment and reply notices): no notification system exists, so none are sent.
- **Author "Top Contributor" badges:** not shown (would be fake without a points system, which is not built).
- Not tested on a real phone, tablet, iPhone Safari or the native apps; the browser pane showed desktop layouts only for this page.
- Font size: community pages are scaled to 88% on desktop and tablet.
