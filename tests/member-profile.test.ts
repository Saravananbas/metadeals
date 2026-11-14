import assert from "node:assert/strict";
import test from "node:test";

// Disposable database only; run alone: DISCUSSIONS_TEST_DB=1 DATABASE_URL=... node --conditions=react-server --import tsx --test --test-force-exit tests/member-profile.test.ts
const databaseUrl = process.env.DATABASE_URL ?? "";
const safe = /\/[^/?]*test[^/?]*(\?|$)/i.test(databaseUrl);
const skip = process.env.DISCUSSIONS_TEST_DB === "1" && safe ? false : "set DISCUSSIONS_TEST_DB=1 and point DATABASE_URL at a disposable database whose name contains 'test'";
process.env.COMMUNITY_ENABLED = "true";
process.env.NEXTAUTH_SECRET ??= "test-nextauth-secret-0123456789abcdef0123";
process.env.NEXTAUTH_URL ??= "http://localhost:4123";
process.env.AUTH_SESSION_SECRET ??= "test-session-secret-0123456789abcdef0123";
process.env.AUTH_TOTP_ENCRYPTION_KEY ??= "dGVzdC10b3RwLWtleS1mb3ItYW5hbHl0aWNzLXRlc3Q=";
process.env.AUTH_BOOTSTRAP_EMAIL ??= "test@example.com";

test("member profile: public fields only, real statistics, owner-only saved items, editing and user name rules", { skip }, async () => {
  await import("dotenv/config");
  process.env.COMMUNITY_ENABLED = "true";
  const { getDatabase } = await import("../src/server/db/client");
  const community = await import("../src/server/community/service");
  const p = await import("../src/server/community/profile");
  const db = getDatabase();
  const wipe = async () => {
    await db.forumNotification.deleteMany({}); await db.forumSave.deleteMany({}); await db.forumPostLike.deleteMany({}); await db.forumCommentLike.deleteMany({}); await db.forumPostVote.deleteMany({}); await db.forumCommentVote.deleteMany({});
    for (let depth = 3; depth >= 0; depth--) await db.forumComment.deleteMany({ where: { depth } });
    await db.dmMessage.deleteMany({}); await db.dmThread.deleteMany({}); await db.forumPost.deleteMany({}); await db.forumProfile.deleteMany({});
    await db.customer.deleteMany({ where: { email: { startsWith: "zzprof-" } } }); await db.forumCommunity.deleteMany({}); await db.customerRateLimit.deleteMany({});
  };
  await wipe();
  try {
    const stamp = Date.now().toString(36);
    const mk = (n: number) => db.customer.create({ data: { name: `Private Name ${n}`, email: `zzprof-${stamp}-${n}@example.com`, emailVerifiedAt: new Date(), createdAt: new Date(Date.UTC(2026, 9, 5)), sex: "female", dateOfBirth: new Date("1990-01-02"), location: "Secret Street 1" } });
    const [a, b] = [await mk(1), await mk(2)];
    await community.ensureProfile(a.id); await community.ensureProfile(b.id);
    await community.listCommunities(null);

    // Editing: validation, reserved and taken names, live availability
    await assert.rejects(() => p.updateMemberProfile(a.id, { handle: "admin" }), (e: Error) => e.name === "ZodError");
    await assert.rejects(() => p.updateMemberProfile(a.id, { handle: "Bad Name!" }), (e: Error) => e.name === "ZodError");
    await assert.rejects(() => p.updateMemberProfile(a.id, { displayName: "MetaDeals4U Support" }), (e: Error) => e.name === "ZodError", "display names cannot pose as staff");
    await assert.rejects(() => p.updateMemberProfile(a.id, { bio: "x".repeat(281) }), (e: Error) => e.name === "ZodError");
    await assert.rejects(() => p.updateMemberProfile(a.id, { email: "new@example.com" } as never), (e: Error) => e.name === "ZodError", "nothing but the public fields can be sent");
    const saved = await p.updateMemberProfile(a.id, { handle: "deal_hunter", displayName: "Venkat P", bio: "Tech enthusiast​ <b>bold</b>", location: "Chennai, Tamil Nadu" });
    assert.deepEqual(saved, { verified: false, handle: "deal_hunter", displayName: "Venkat P", bio: "Tech enthusiast <b>bold</b>", location: "Chennai, Tamil Nadu", avatarUrl: null });
    await assert.rejects(() => p.updateMemberProfile(b.id, { handle: "deal_hunter" }), { status: 409 });
    assert.equal((await p.userNameAvailability(b.id, "deal_hunter")).available, false);
    assert.equal((await p.userNameAvailability(b.id, "Deal_Hunter")).available, false, "names are compared without case");
    assert.equal((await p.userNameAvailability(a.id, "deal_hunter")).available, true, "your own name is fine");
    assert.equal((await p.userNameAvailability(b.id, "fresh_name")).available, true);
    assert.equal((await p.userNameAvailability(b.id, "moderator")).available, false);
    assert.equal((await p.updateMemberProfile(a.id, { location: "" })).location, null, "optional fields can be cleared");
    await p.updateMemberProfile(a.id, { location: "Chennai, Tamil Nadu" });
    await p.updateMemberProfile(b.id, { handle: "second_member" });

    // Real activity
    const post = await community.createPost(a.id, { type: "DISCUSSION", communitySlug: "off-topic", title: "Upcoming sale, what to expect", bodyHtml: "<p>Thoughts on the sale this month</p>" });
    const hidden = await community.createPost(a.id, { type: "DISCUSSION", communitySlug: "off-topic", title: "Removed thread", bodyHtml: "<p>This one gets removed later</p>" });
    await db.forumPost.update({ where: { id: hidden.id }, data: { status: "REMOVED" } });
    const comment = await community.createComment(a.id, post.id, { body: "Adding a comment of my own" });
    await community.setPostLike(b.id, post.id, true); await community.setCommentLike(b.id, comment.id, true);
    await community.setSaved(a.id, post.id, true);

    // Visitor and other-member views: public data only
    for (const viewer of [null, b.id]) {
      const view = await p.getMemberProfile("Deal_Hunter", viewer);
      assert.equal(view.handle, "deal_hunter"); assert.equal(view.displayName, "Venkat P"); assert.equal(view.memberSince, "2026-10"); assert.equal(view.isOwner, false);
      assert.deepEqual(view.stats, { dealsShared: 0, publishedDeals: 0, discussions: 1, comments: 1, likesReceived: 2 }, "counts come from the database; removed content and saved items are not included");
      assert.deepEqual(view.activity?.map((x) => x.kind).sort(), ["comment", "discussion"]);
      const json = JSON.stringify([view, await p.getMemberProfile("deal_hunter", viewer, "deals"), await p.getMemberProfile("deal_hunter", viewer, "discussions"), await p.getMemberProfile("deal_hunter", viewer, "comments"), await p.getMemberProfile("deal_hunter", viewer, "about")]);
      for (const secret of ["@example.com", "Private Name", "Secret Street", "1990", "female", "passwordHash", "customerId", a.id, "Removed thread"]) assert.ok(!json.includes(secret), `public profile must not contain ${secret}`);
      await assert.rejects(() => p.getMemberProfile("deal_hunter", viewer, "saved"), { status: 404 }, "saved items are private");
    }
    // Owner view
    const own = await p.getMemberProfile("deal_hunter", a.id);
    assert.equal(own.isOwner, true); assert.equal(own.stats.saved, 1);
    assert.deepEqual((await p.getMemberProfile("deal_hunter", a.id, "saved")).saved?.map((x) => x.id), [post.id]);
    assert.deepEqual((await p.getMemberProfile("deal_hunter", a.id, "discussions")).discussions?.map((x) => x.title), ["Upcoming sale, what to expect"]);
    assert.equal((await p.getMemberProfile("deal_hunter", a.id, "comments")).comments?.[0].post.slug, post.slug);

    // Unknown and disabled members
    await assert.rejects(() => p.getMemberProfile("nobody_here", null), { status: 404 });
    await db.customer.update({ where: { id: b.id }, data: { disabledAt: new Date() } });
    await assert.rejects(() => p.getMemberProfile("second_member", null), { status: 404 });
    await assert.rejects(() => p.updateMemberProfile(b.id, { bio: "still here" }), { status: 403 });
  } finally {
    await wipe();
  }
});
