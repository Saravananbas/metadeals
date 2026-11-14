import assert from "node:assert/strict";
import test from "node:test";

// Disposable database only; run alone (it empties forum tables): DISCUSSIONS_TEST_DB=1 DATABASE_URL=... node --test --test-force-exit tests/community-announcements.test.ts
const databaseUrl = process.env.DATABASE_URL ?? "";
const safe = /\/[^/?]*test[^/?]*(\?|$)/i.test(databaseUrl);
const skip = process.env.DISCUSSIONS_TEST_DB === "1" && safe ? false : "set DISCUSSIONS_TEST_DB=1 and point DATABASE_URL at a disposable database whose name contains 'test'";
process.env.COMMUNITY_ENABLED = "true";
process.env.NEXTAUTH_SECRET ??= "test-nextauth-secret-0123456789abcdef0123";
process.env.NEXTAUTH_URL ??= "http://localhost:4123";
process.env.AUTH_SESSION_SECRET ??= "test-session-secret-0123456789abcdef0123";
process.env.AUTH_TOTP_ENCRYPTION_KEY ??= "dGVzdC10b3RwLWtleS1mb3ItYW5hbHl0aWNzLXRlc3Q=";
process.env.AUTH_BOOTSTRAP_EMAIL ??= "test@example.com";

async function world() {
  await import("dotenv/config");
  process.env.COMMUNITY_ENABLED = "true";
  const { getDatabase } = await import("../src/server/db/client");
  const db = getDatabase();
  const wipe = async () => {
    await db.forumNotification.deleteMany({}); await db.forumAnnouncement.deleteMany({}); await db.staffPermissionGrant.deleteMany({ where: { user: { email: { startsWith: "zzann-" } } } });
    await db.forumPostLike.deleteMany({}); await db.forumSave.deleteMany({}); await db.forumPostVote.deleteMany({}); await db.forumModerationAction.deleteMany({}); await db.forumReport.deleteMany({});
    for (let depth = 3; depth >= 0; depth--) await db.forumComment.deleteMany({ where: { depth } });
    await db.forumPost.deleteMany({}); await db.forumProfile.deleteMany({});
    await db.customer.deleteMany({ where: { email: { startsWith: "zzann-" } } }); await db.auditEvent.deleteMany({ where: { action: { startsWith: "announcement." } } });
    await db.user.deleteMany({ where: { email: { startsWith: "zzann-" } } }); await db.forumCommunity.deleteMany({}); await db.customerRateLimit.deleteMany({});
  };
  await wipe();
  const stamp = Date.now().toString(36);
  const staff = (role: "SUPER_ADMIN" | "ADMIN" | "EDITOR", n: number) => db.user.create({ data: { email: `zzann-${stamp}-${role.toLowerCase()}-${n}@example.com`, role, status: "ACTIVE" } });
  const member = (n: number) => db.customer.create({ data: { name: `Real ${n}`, email: `zzann-${stamp}-m${n}@example.com`, emailVerifiedAt: new Date(), createdAt: new Date(Date.now() - 3 * 86_400_000) } });
  return { db, wipe, staff, member };
}

test("official announcements: permission, team identity, audit trail, notices, and no impersonation", { skip }, async () => {
  const { db, wipe, staff, member } = await world();
  const a = await import("../src/server/community/announcements");
  const s = await import("../src/server/community/service");
  try {
    const [sa, admin, editor, editor2] = [await staff("SUPER_ADMIN", 1), await staff("ADMIN", 2), await staff("EDITOR", 3), await staff("EDITOR", 4)];
    const A = { id: admin.id, role: "ADMIN" as const }, E = { id: editor.id, role: "EDITOR" as const }, E2 = { id: editor2.id, role: "EDITOR" as const }, S = { id: sa.id, role: "SUPER_ADMIN" as const };
    const [m1, m2] = [await member(1), await member(2)];
    await s.ensureProfile(m1.id); await s.ensureProfile(m2.id);
    const body = '<p>We have <strong>new features</strong> coming. <script>alert(1)</script></p>';

    // Permission: admin yes, plain editor no, editor with an explicit grant yes (grants only by a super admin)
    await assert.rejects(() => a.createAnnouncement(E, { title: "Editor tries", bodyHtml: body }), { status: 403 });
    await assert.rejects(() => a.listAnnouncementsAdmin(E), { status: 403 });
    await assert.rejects(() => a.setPublisherGrant(A, editor.id, true), { status: 403 });
    await assert.rejects(() => a.setPublisherGrant(E, editor.id, true), { status: 403 });
    await a.setPublisherGrant(S, editor2.id, true);
    assert.equal(await a.canPublish(E2), true); assert.equal(await a.canPublish(E), false);

    // Create, edit, publish: the real staff ids are stored, the public shape never contains them
    const draft = await a.createAnnouncement(A, { title: "New features are coming", bodyHtml: body });
    assert.equal(draft.status, "DRAFT");
    assert.equal((await a.listPublicAnnouncements(10)).total, 0, "drafts are not public");
    await assert.rejects(() => a.updateAnnouncement(A, draft.id, { title: "New features are coming", bodyHtml: body, version: 99 }), { status: 409 });
    const edited = await a.updateAnnouncement(E2, draft.id, { title: "New features are coming soon", bodyHtml: "<p>Edited by a granted editor, with <em>style</em>.</p>", version: draft.version });
    assert.equal(edited.version, draft.version + 1);
    await a.publishAnnouncement(A, draft.id);
    await assert.rejects(() => a.publishAnnouncement(A, draft.id), { status: 409 });
    const stored = await db.forumAnnouncement.findUniqueOrThrow({ where: { id: draft.id } });
    assert.equal(stored.createdById, admin.id); assert.equal(stored.publishedById, admin.id); assert.equal(stored.status, "PUBLISHED");
    const list = await a.listPublicAnnouncements(10);
    assert.equal(list.total, 1);
    const pub = await a.getPublicAnnouncement(stored.slug);
    assert.equal(pub?.author.name, "MetaDeals4U Team"); assert.equal(pub?.author.official, true);
    const wire = JSON.stringify([list, pub]);
    for (const secret of [admin.id, editor2.id, admin.email!, editor2.email!, "createdBy", "publishedBy"]) assert.ok(!wire.includes(secret), `public data never contains ${secret}`);
    assert.ok(pub?.bodyHtml && !pub.bodyHtml.includes("<script"));

    // Every member got one notice; unpublishing removes it
    assert.equal(await db.forumNotification.count({ where: { type: "ANNOUNCEMENT", postId: draft.id } }), 2);
    const mine = await (await import("../src/server/community/notifications")).listNotifications(m1.id);
    assert.equal(mine.unread, 1); assert.equal(mine.items[0].type, "ANNOUNCEMENT"); assert.equal(mine.items[0].postSlug, stored.slug);
    await a.unpublishAnnouncement(E2, draft.id);
    assert.equal((await a.getPublicAnnouncement(stored.slug)), null, "unpublished announcements disappear");
    assert.equal(await db.forumNotification.count({ where: { type: "ANNOUNCEMENT" } }), 0);
    await a.publishAnnouncement(S, draft.id);
    assert.equal(await db.forumNotification.count({ where: { type: "ANNOUNCEMENT", postId: draft.id } }), 2, "publishing again notifies once per member, not twice");
    await a.deleteAnnouncement(A, draft.id);
    assert.equal(await db.forumAnnouncement.count(), 0);

    // Audit trail: creation, edit, publish, unpublish, publish, delete and the grant, each with the real actor
    const audit = await db.auditEvent.findMany({ where: { action: { startsWith: "announcement." } }, orderBy: { createdAt: "asc" }, select: { action: true, actorId: true } });
    assert.deepEqual(audit.map((x) => x.action), ["announcement.grant", "announcement.create", "announcement.edit", "announcement.publish", "announcement.unpublish", "announcement.publish", "announcement.delete"]);
    assert.deepEqual(audit.map((x) => x.actorId), [sa.id, admin.id, editor2.id, admin.id, editor2.id, sa.id, admin.id]);
    await a.setPublisherGrant(S, editor2.id, false);
    assert.equal(await a.canPublish(E2), false, "a revoked grant stops working");

    // Members cannot post as the team: not in the announcements area, and not under a team-like name
    await s.listCommunities(null);
    await assert.rejects(() => s.createPost(m1.id, { type: "DISCUSSION", communitySlug: "announcements", title: "Official news from me", bodyHtml: "<p>Pretending to be the team</p>" }), { status: 403 });
    const { handleSchema } = await import("../src/features/community/validation");
    for (const bad of ["metadeals4u_team", "MetaDeals_Official", "official", "the_metadeals", "admin", "moderator_bob"]) assert.equal(handleSchema.safeParse(bad).success, false, `${bad} is refused`);
    for (const ok of ["deal_hunter", "badminton_fan", "priya_2026"]) assert.equal(handleSchema.safeParse(ok).success, true, `${ok} is allowed`);
  } finally { await wipe(); }
});

test("notifications: replies and comments notify the right member, preferences are respected, moderators are never named, notices are private", { skip }, async () => {
  const { db, wipe, staff, member } = await world();
  const s = await import("../src/server/community/service");
  const n = await import("../src/server/community/notifications");
  const mod = await import("../src/server/community/moderation");
  try {
    const admin = await staff("ADMIN", 1);
    const [a, b, c] = [await member(1), await member(2), await member(3)];
    // (the automatic category sync only runs once a minute per process, so the area is created directly here)
    await db.forumCommunity.create({ data: { slug: "off-topic", name: "Off Topic / General", description: "General talk" } });
    const quiet = await s.createPost(a.id, { type: "DISCUSSION", communitySlug: "off-topic", title: "Quiet post", bodyHtml: "<p>I do not want comment notices</p>", notifyReplies: false });
    const loud = await s.createPost(a.id, { type: "DISCUSSION", communitySlug: "off-topic", title: "Loud post", bodyHtml: "<p>Please tell me about replies</p>", notifyReplies: true });

    await s.createComment(b.id, quiet.id, { bodyHtml: "<p>Nice quiet post</p>" });
    assert.equal((await n.listNotifications(a.id)).unread, 0, "no comment notice when the author switched them off");
    const first = await s.createComment(b.id, loud.id, { bodyHtml: "<p>Nice loud post</p>" });
    assert.equal((await n.listNotifications(a.id)).items[0].type, "POST_COMMENT");
    await s.createComment(a.id, loud.id, { bodyHtml: "<p>My own comment</p>" });
    assert.equal((await n.listNotifications(a.id)).unread, 1, "no notice for your own comment");
    // A reply tells the comment's author (always, even though the post author asked for post notices); one notice, not two
    const reply = await s.createComment(a.id, loud.id, { bodyHtml: "<p>Thanks for the kind words</p>", parentId: first.id });
    const forB = await n.listNotifications(b.id);
    assert.equal(forB.items.filter((x) => x.type === "COMMENT_REPLY").length, 1); assert.equal(forB.items[0].commentId, reply.id); assert.equal(forB.items[0].actor !== null, true);
    const c3 = await s.createComment(c.id, loud.id, { bodyHtml: "<p>Reply from C to B</p>", parentId: first.id });
    assert.equal((await n.listNotifications(b.id)).unread, 2); assert.equal((await n.listNotifications(a.id)).unread, 2, "post author asked for notices, so is told about C's reply too");
    void c3;

    // Moderator actions: author told, moderator not named
    await mod.actOnComment({ id: admin.id, role: "ADMIN" }, first.id, "remove", { reason: "Breaks the rules" });
    const modNotice = (await n.listNotifications(b.id)).items.find((x) => x.type === "COMMENT_REMOVED");
    assert.ok(modNotice); assert.equal(modNotice?.actor, null, "a moderator is never named");
    const live = await db.forumPost.findUniqueOrThrow({ where: { id: loud.id }, select: { version: true } });
    await mod.actOnPost({ id: admin.id, role: "ADMIN" }, loud.id, "lock", { version: live.version, reason: "Locked for review" });
    assert.ok((await n.listNotifications(a.id)).items.some((x) => x.type === "POST_LOCKED"));

    // Read state and privacy
    const ids = (await n.listNotifications(b.id)).items.map((x) => x.id);
    assert.deepEqual(await n.markNotificationsRead(c.id, ids), { marked: 0 }, "another member cannot mark someone else's notices");
    assert.equal((await n.listNotifications(b.id)).unread > 0, true);
    await n.markNotificationsRead(b.id, [ids[0]]);
    assert.equal((await n.listNotifications(b.id)).items.find((x) => x.id === ids[0])?.read, true);
    await n.markNotificationsRead(b.id);
    assert.equal((await n.listNotifications(b.id)).unread, 0);
    assert.equal((await n.listNotifications(c.id)).items.every((x) => !ids.includes(x.id)), true, "C never sees B's notices");
  } finally { await wipe(); }
});
