# New Discussion composer (13 Nov 2026)

Page: `/community/submit` (`src/app/community/submit/page.tsx`). Same members, categories and forum tables; no second system.

## What it does
- Three type cards (Discussion, Question, Deal), category and subcategory (from the shop categories plus the general areas), title with 120-character counter, rich-text editor (TipTap: paragraph/headings, bold, italic, underline, strike, bullet and numbered lists, indent, link, emoji, clear formatting, undo/redo), up to 3 pictures (JPEG, PNG, WebP, 5 MB each, drag and drop, remove, reorder with arrows or drag, upload progress), live preview (desktop and mobile frames), tips card, notify checkbox, Save Draft, Preview (phones), Post Discussion.
- **Draft:** one private draft per member, autosaved (at most once every 2 s, only when something changed), restored on return, removed when the post is published. `GET/PUT/DELETE /api/v1/community/draft`.
- **Pictures:** `POST /api/v1/community/images` (multipart), `GET/DELETE /api/v1/community/images/[id]`. The bytes are decoded with sharp and re-encoded to WebP (1600 px max, metadata dropped); the file type and name sent by the browser are never trusted. A picture waits unattached until the post is published; only its owner can see it before then; published pictures are public. At most 3 waiting pictures per member, 30 uploads an hour.
- **Rich text:** sanitized on the server with an allow-list (`src/server/community/richtext.ts`): no scripts, styles, event handlers, images or iframes; links must be public https and get `rel="nofollow ugc noopener noreferrer"`. The plain text is kept in `body`, so search, previews, duplicate checks, moderation and the mobile API keep working; the HTML is in `bodyHtml` (sanitized again when shown). Limit 5,000 characters of text.
- **Posting:** existing `POST /api/v1/community/posts` (extended with `bodyHtml`, `imageIds`, `notifyReplies`). Existing moderation (review for new accounts with links, Announcements needs review), duplicate refusal, rate limits and ownership rules apply unchanged. A post takes only the author's own waiting pictures.
- **Deal type:** uses the existing community deal fields (link, price, MRP, store, coupon) and stays a community deal, not an official one. Product name = the title. **Brand and expiry date are not supported by the existing deal model and were not added.**

## Database (additive migration `20261118100000_forum_composer`)
`ForumPost.bodyHtml` (text, null for old posts), `ForumPost.notifyReplies` (default false), new tables `ForumPostImage` and `ForumPostDraft`. Applied to the local development and test databases only. **Not applied to staging yet.**

## Tests (disposable database, run alone with `DISCUSSIONS_TEST_DB=1`)
`tests/community-composer.test.ts`: sanitizer against script, onerror, javascript: and http links, styles, iframes; picture re-encoding and refusal of non-images and oversized files; staged pictures private; 3-picture limit; draft privacy and replacement; another member's picture refused; ordered pictures; length and title limits; duplicate refusal; old plain-text posts still work. The test found a real sanitizer bug (a safe link got a wrong closing tag), now fixed. Together with the earlier forum, submissions, roles, analytics, recovery and security tests: 51 of 51 pass. Browser pane: desktop layout, typing, live preview, draft save and restore, publishing a real post, and a 390 px layout with no sideways scroll.

## Not done / outstanding
- **Reply notifications:** the checkbox is saved with the post, but there is no notification system, so nothing is sent yet.
- **Blog, Help, Categories links** in the top bar are omitted (no such pages). The "community guidelines" link points to the Community page until a guidelines page exists.
- **Inline pictures inside the text** are not supported: pictures are attached below the text (and shown in the preview).
- **Not tested** on real Android or iPhone browsers, tablets, or the native apps.
- Dev note: the browser pane throttles hidden pages, so a page can look un-hydrated until a screenshot wakes it.
