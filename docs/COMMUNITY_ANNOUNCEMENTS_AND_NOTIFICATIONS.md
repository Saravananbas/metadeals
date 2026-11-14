# Official announcements, notifications, feed cards (13 Nov 2026)

## Official announcements (decision approved: shared "MetaDeals4U Team" identity)
- **Public identity:** every announcement shows the author as **MetaDeals4U Team** with an Official badge (`OfficialBadge`), whichever staff member published it. The public data (`listPublicAnnouncements`, `getPublicAnnouncement`) is built without any staff field; a test checks that staff ids and emails never appear in it.
- **No fake accounts:** announcements are their own table (`ForumAnnouncement`), not forum posts, so no customer or staff login represents the team. Staff keep their existing separate staff sign-in (with authenticator code).
- **Who may publish:** `ADMIN` and `SUPER_ADMIN` by role; anyone else only with an explicit `announcement.publish` grant (`StaffPermissionGrant`), given or removed by a super admin in the admin portal. The permission is checked again inside every action, not only on the page.
- **Real staff recorded:** `createdById` and `publishedById` are stored on every announcement (staff only; never sent to members).
- **Audit trail** (existing `AuditEvent`): `announcement.create`, `.edit`, `.publish`, `.unpublish`, `.delete`, `.grant`, `.revoke`, each with the real staff id, written in the same transaction as the change.
- **Admin portal:** new "Announcements" page (`/admin/announcements`): rich-text editor, save draft, edit, publish, unpublish, delete (each with a confirmation), and "Who can publish" for super admins.
- **Members' side:** `/community/announcements` (list) and `/community/announcements/[slug]`; the landing page's "Official announcements" card (title, short text, date, Official badge) and the left "Announcements" entry with a real count. Announcements are read-only (no comments or votes).
- **No impersonation:** members cannot post in the Announcements area (403), and community user names that look like the team or staff (for example `metadeals4u_team`, `official`, `admin`) are refused. Existing reserved-name rules still apply.
- **Notifications:** publishing sends one in-app notice to every member (re-publishing does not duplicate it); unpublishing or deleting removes it.
- **Database (additive migration `20261123100000_forum_announcements`):** tables `ForumAnnouncement` and `StaffPermissionGrant`. Applied locally and on the test database only.

## Notifications (additive migration `20261122100000_forum_notifications`)
- Table `ForumNotification`. In-app only (bell with unread count in the community top bar, list with "Mark all as read", link to the discussion or comment). Email and mobile push are not built yet; the same API (`GET /api/v1/community/notifications`, `POST .../notifications/read`) can serve the apps later.
- **Events:** someone comments on your discussion (only if you left "notify me about replies" ticked when posting), someone replies to your comment (always), a moderator approves, removes, restores, locks or unlocks your discussion, or removes or restores your comment (the moderator is never named), and official announcements.
- Nobody is notified about their own actions; notices are private (a member can only read or mark their own); old notices are tidied up after 90 days.

## Feed cards, categories, skeletons
- Each feed card now has vote, Like, comments, views, Share (copy link, WhatsApp, native), bookmark and a **View Discussion** button; the whole card opens the discussion without getting in the way of its buttons.
- **Categories** dropdown in the top bar (real main categories, linking to the category feeds).
- **Loading skeletons** in the same three-column layout while a community page loads.

## Tests
`tests/community-announcements.test.ts` (permissions and grants, team identity with no staff data in public output, audit trail with real actors, notices on publish/unpublish/re-publish, no impersonation) and notification rules (preferences, replies, no self-notices, moderators not named, privacy between members). With the earlier tests: 59 of 59 pass on the disposable database. Type check and lint clean. Browser pane: landing page, bell and the announcements card checked at desktop width.

## Not done / outstanding
- **Staging:** six migrations are pending there (composer, visitor cookie, password reset, likes, notifications, announcements).
- Email and push notifications; a notification preferences screen beyond the per-post checkbox; per-user grant of other permissions.
- Not tested on real phones or tablets or the native apps.
