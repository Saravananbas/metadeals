# Physical device test checklist (to run by hand; NOT yet done)

Browser emulation only was done (see the launch tracker). Tick each line on real hardware and note device, OS and browser.

**Devices:** Android phone (Chrome), Android phone (Samsung Internet), iPhone (Safari), iPad (Safari, portrait and landscape), an Android tablet (optional).
**Site:** `https://staging.metadeals4u.in` (after the staging migrations).

For each device:
- [ ] Home page, deal page and a Buy Now link open and the back button works.
- [ ] Sign up with email: code arrives, account is created; sign in with email and with user name; Remember me; Forgot password end to end.
- [ ] Google sign-in completes and returns to MetaDeals4U signed in (Chrome and Samsung Internet; Safari).
- [ ] Apple sign-in completes (iPhone Safari).
- [ ] Community feed: filters, search, page numbers, vote, like, bookmark, share (native share sheet, WhatsApp, copy link).
- [ ] Open a discussion: nested comments, quote reply, sort, report, edit and delete your own comment.
- [ ] New discussion: type cards, category and subcategory, rich-text toolbar, emoji, link, up to 3 pictures from the camera and gallery (check large phone photos), draft saves and restores, preview, post.
- [ ] Notification bell: unread count, open, mark all read, links go to the right place.
- [ ] Official announcement appears as MetaDeals4U Team with the Official badge.
- [ ] No sideways scrolling, no overlapping or clipped buttons, taps land on the right control, the on-screen keyboard does not hide the Post button, text is readable without zooming.
- [ ] Rotate to landscape and back.
- [ ] Slow network (throttled 3G): loading skeletons appear; errors are understandable.

Record failures with a screenshot and the device name.
