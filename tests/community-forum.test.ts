import assert from "node:assert/strict";
import test from "node:test";

// Needs a DISPOSABLE migrated database (its name must contain "test"): FORUM_TEST_DB=1 DATABASE_URL=... npm test
// All forum tables are emptied before and after each test, so never point this at a database you care about.
const databaseUrl = process.env.DATABASE_URL ?? "";
const safe = /\/[^/?]*test[^/?]*(\?|$)/i.test(databaseUrl);
const skip = process.env.FORUM_TEST_DB === "1" && safe ? false : "set FORUM_TEST_DB=1 and point DATABASE_URL at a disposable database whose name contains 'test'";

process.env.COMMUNITY_ENABLED = "true";
process.env.NEXTAUTH_SECRET ??= "test-nextauth-secret-0123456789abcdef0123";
process.env.NEXTAUTH_URL ??= "http://localhost:4123";
process.env.AUTH_SESSION_SECRET ??= "test-session-secret-0123456789abcdef0123";
process.env.AUTH_TOTP_ENCRYPTION_KEY ??= "dGVzdC10b3RwLWtleS1mb3ItYW5hbHl0aWNzLXRlc3Q=";
process.env.AUTH_BOOTSTRAP_EMAIL ??= "test@example.com";

const load = async () => {
  await import("dotenv/config");
  process.env.COMMUNITY_ENABLED = "true";
  return {
    ...(await import("../src/server/db/client")),
    ...(await import("../src/server/community/service")),
    ...(await import("../src/server/community/moderation")),
    ...(await import("../src/features/community/validation")),
  };
};

async function setup() {
  const m = await load();
  const db = m.getDatabase();
  const wipe = async () => {
    await db.forumModerationAction.deleteMany({});
    await db.forumReport.deleteMany({});
    await db.forumPostVote.deleteMany({});
    await db.forumCommentVote.deleteMany({});
    await db.forumSave.deleteMany({});
    await db.forumFollow.deleteMany({});
    for (let depth = 3; depth >= 0; depth--) await db.forumComment.deleteMany({ where: { depth } });
    await db.forumPost.deleteMany({});
    await db.forumProfile.deleteMany({});
    await db.customer.deleteMany({ where: { email: { startsWith: "zzforum-" } } });
    await db.forumCommunity.deleteMany({});
    await db.customerRateLimit.deleteMany({});
  };
  await wipe();
  const admin = await db.user.findFirstOrThrow({ where: { status: "ACTIVE", totpEnabledAt: { not: null }, role: { in: ["SUPER_ADMIN", "ADMIN"] } } });
  const actor = { id: admin.id, role: admin.role as "SUPER_ADMIN" | "ADMIN" };
  const stamp = Date.now().toString(36);
  let n = 0;
  const member = (extra: Record<string, unknown> = {}, old = true) =>
    db.customer.create({ data: { name: `Real Name ${++n}`, email: `zzforum-${stamp}-${n}@example.com`, emailVerifiedAt: new Date(), createdAt: old ? new Date(Date.now() - 3 * 86_400_000) : new Date(), ...extra } });
  const community = (slug = "general", extra: Record<string, unknown> = {}) =>
    m.saveCommunity(actor, { slug, name: slug.toUpperCase(), description: "A place to talk about " + slug, ...extra });
  const discussion = (title = "Which phone should I buy?", extra: Record<string, unknown> = {}) =>
    ({ type: "DISCUSSION", communitySlug: "general", title, body: "Looking for a phone under 30000 with a good camera.", ...extra });
  const deal = (extra: Record<string, unknown> = {}) =>
    ({ type: "DEAL", communitySlug: "general", title: "Earbuds at half price", body: "", url: `https://www.example-store.in/p/earbuds-${stamp}-${++n}`, merchantName: "Example Store", priceMinor: 99900, mrpMinor: 199900, ...extra });
  return { m, db, actor, wipe, member, community, discussion, deal };
}
const status = (promise: Promise<unknown>) => promise.then(() => 0, (e: { status?: number }) => e.status ?? -1);

test("anonymous visitors can read but every write needs a signed-in session; the master switch hides everything", { skip }, async () => {
  const f = await setup();
  try {
    await f.community();
    const feed = await import("../src/app/api/v1/community/feed/route");
    const posts = await import("../src/app/api/v1/community/posts/route");
    const votes = await import("../src/app/api/v1/community/posts/[ref]/vote/route");
    const reports = await import("../src/app/api/v1/community/reports/route");
    const origin = "http://localhost:4123";
    assert.equal((await feed.GET(new Request(`${origin}/api/v1/community/feed`))).status, 200, "anonymous read works");
    const body = JSON.stringify(discussionBody());
    assert.equal((await posts.POST(new Request(`${origin}/api/v1/community/posts`, { method: "POST", headers: { origin, "content-type": "application/json" }, body }))).status, 401);
    assert.equal((await posts.POST(new Request(`${origin}/api/v1/community/posts`, { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" }, body }))).status, 403, "cross-site writes are refused");
    assert.equal((await votes.PUT(new Request(`${origin}/x`, { method: "PUT", headers: { origin, "content-type": "application/json" }, body: '{"value":1}' }), { params: Promise.resolve({ ref: "x" }) })).status, 401);
    assert.equal((await reports.POST(new Request(`${origin}/x`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: "{}" }))).status, 401);
    process.env.COMMUNITY_ENABLED = "false";
    assert.equal((await feed.GET(new Request(`${origin}/api/v1/community/feed`))).status, 404, "the whole community is hidden when switched off");
    process.env.COMMUNITY_ENABLED = "true";
  } finally { await f.wipe(); await f.m.disconnectDatabase(); }
  function discussionBody() { return { type: "DISCUSSION", communitySlug: "general", title: "Hello there", body: "A question about phones." }; }
});

test("posting: verified accounts only, safe links, plain-text storage, duplicate and rate limits", { skip }, async () => {
  const f = await setup();
  try {
    await f.community();
    const ok = await f.member();
    const unverified = await f.member({ emailVerifiedAt: null }), disabled = await f.member({ disabledAt: new Date() });
    assert.equal(await status(f.m.createPost(unverified.id, f.discussion())), 403);
    assert.equal(await status(f.m.createPost(disabled.id, f.discussion())), 403);
    assert.equal(await status(f.m.createPost("nobody", f.discussion())), 403);

    for (const url of ["http://shop.example-store.in/a", "https://localhost/a", "https://127.0.0.1/a", "https://0x7f.0.0.1/a", "https://2130706433/a", "https://user:pass@shop.example-store.in/a", "https://shop.example-store.in:8443/a", "javascript:alert(1)", "https://[::1]/a", "ftp://shop.example-store.in/a", "data:text/html,hi"]) {
      await assert.rejects(f.m.createPost(ok.id, f.deal({ url })), (e: Error) => e.name === "ZodError", `rejects ${url}`);
    }
    for (const bad of [{ title: "abc" }, { body: "short" }, { communitySlug: "" }, { priceMinor: 5 }, { type: "NEWS" }, { authorId: "someone" }]) {
      await assert.rejects(f.m.createPost(ok.id, f.discussion("A valid title here", bad)), (e: Error) => e.name === "ZodError");
    }
    await assert.rejects(f.m.createPost(ok.id, f.discussion("Too many links", { body: "see https://a.example-store.in https://b.example-store.in https://c.example-store.in https://d.example-store.in" })), (e: Error) => e.name === "ZodError");
    assert.equal(await status(f.m.createPost(ok.id, f.discussion("Nowhere to post", { communitySlug: "missing" }))), 404);

    // Markup is stored and returned as plain text (React escapes it on screen); control characters are removed.
    const evil = "<script>alert(1)</script> <img src=x onerror=alert(2)> hello\u0000 there‮";
    const created = await f.m.createPost(ok.id, f.discussion("Is this safe to show?", { body: evil + " more text here" }));
    assert.equal(created.body, "<script>alert(1)</script> <img src=x onerror=alert(2)> hello there more text here");
    assert.equal(created.viewer?.status, "PUBLISHED");

    assert.equal(await status(f.m.createPost(ok.id, f.discussion("Is this safe to show?", { body: evil + " more text here" }))), 409, "exact duplicates are refused");
    const first = await f.m.createPost(ok.id, f.deal({ url: "https://www.example-store.in/p/same-product?utm_source=x" }));
    assert.equal(await status(f.m.createPost((await f.member()).id, f.deal({ url: "https://www.example-store.in/p/same-product?tag=abc#top" }))), 409, "the same link cannot be shared twice in two weeks");
    assert.ok(first.slug);

    // Rate limit: five posts an hour (two were already made above).
    let limited = 0;
    for (let i = 0; i < 6; i++) if (await status(f.m.createPost(ok.id, f.discussion(`Another question number ${i}`, { body: `Question body number ${i} with some words` }))) === 429) limited++;
    assert.ok(limited >= 1, "the sixth post in an hour is refused");
  } finally { await f.wipe(); await f.m.disconnectDatabase(); }
});

test("review policy: new accounts with links wait for a moderator; pending posts are private; moderation needs permission", { skip }, async () => {
  const f = await setup();
  try {
    await f.community();
    const fresh = await f.member({}, false), other = await f.member();
    const pending = await f.m.createPost(fresh.id, f.deal());
    assert.equal(pending.viewer?.status, "PENDING_REVIEW");
    assert.equal((await f.m.listFeed({}, null)).items.length, 0, "not in the public feed");
    assert.equal((await f.m.listFeed({}, other.id)).items.length, 0, "not in another member's feed");
    assert.equal(await status(f.m.getPost(pending.slug, null)), 404);
    assert.equal(await status(f.m.getPost(pending.slug, other.id)), 404);
    assert.equal((await f.m.getPost(pending.slug, fresh.id)).slug, pending.slug, "the author can see their own pending post");
    assert.equal(await status(f.m.createComment(other.id, pending.slug, { body: "first!" })), 404, "no comments on a post that is not public");

    // A link in a comment from a brand-new account is refused; a plain comment is fine once public.
    const queue = await f.m.listQueue(f.actor);
    assert.equal(queue.total, 1);

    const editor = { id: f.actor.id, role: "EDITOR" as never }, mystery = { id: f.actor.id, role: "MODERATOR" as never };
    for (const who of [editor, mystery]) {
      assert.equal(await status(f.m.listQueue(who)), 403);
      assert.equal(await status(f.m.listReports(who, "OPEN")), 403);
      assert.equal(await status(f.m.actOnPost(who, pending.id, "approve", { version: 1 })), 403);
      assert.equal(await status(f.m.actOnComment(who, "x", "remove", { reason: "no good reason" })), 403);
      assert.equal(await status(f.m.resolveReport(who, "x", { version: 1, outcome: "RESOLVED", resolution: "fine now" })), 403);
      assert.equal(await status(f.m.setMemberStatus(who, "x", "suspend", { reason: "no good reason" })), 403);
      assert.equal(await status(f.m.saveCommunity(who, { slug: "nope", name: "Nope", description: "Not allowed here" })), 403);
    }

    assert.equal(await status(f.m.actOnPost(f.actor, pending.id, "approve", { version: 99 })), 409, "stale version");
    assert.equal(await f.db.forumModerationAction.count(), 1, "a failed action leaves no history row (only the community creation exists)");
    await f.m.actOnPost(f.actor, pending.id, "approve", { version: 1 });
    assert.equal((await f.m.listFeed({}, null)).items.length, 1, "public after approval");
    assert.equal(await status(f.m.actOnPost(f.actor, pending.id, "approve", { version: 2 })), 409, "cannot approve twice");
    assert.equal(await status(f.m.createComment(fresh.id, pending.slug, { body: "see https://a.example-store.in/x" })), 403, "new accounts cannot post links in comments");
  } finally { await f.wipe(); await f.m.disconnectDatabase(); }
});

test("ownership and privacy: members only change their own content; public data never carries private fields", { skip }, async () => {
  const f = await setup();
  try {
    await f.community();
    const a = await f.member({ sex: "FEMALE", location: "Chennai", dateOfBirth: new Date("1990-01-01T00:00:00Z") }), b = await f.member();
    const post = await f.m.createPost(a.id, f.discussion());
    const comment = await f.m.createComment(b.id, post.slug, { body: "I would pick the cheaper one." });
    assert.equal(await status(f.m.editPost(b.id, post.id, { version: 1, title: "Hijacked title here" })), 404);
    assert.equal(await status(f.m.deletePost(b.id, post.id)), 404);
    assert.equal(await status(f.m.editComment(a.id, comment.id, { version: 1, body: "Hijacked comment" })), 404);
    assert.equal(await status(f.m.deleteComment(a.id, comment.id)), 404);

    const mine = await f.m.editPost(a.id, post.id, { version: 1, title: "Which phone should I buy now?" });
    assert.equal(mine.title, "Which phone should I buy now?");
    assert.equal(await status(f.m.editPost(a.id, post.id, { version: 1, title: "A stale edit goes here" })), 409, "stale version");

    // Nothing private in anything public.
    const publicJson = JSON.stringify([await f.m.listFeed({}, null), await f.m.getPost(post.slug, null), await f.m.listComments(post.slug, undefined, null), await f.m.getPublicProfile((await f.db.forumProfile.findUniqueOrThrow({ where: { customerId: a.id } })).handle), await f.m.listCommunities(null)]);
    for (const secret of [a.email, a.name, "Chennai", "FEMALE", "1990", a.id, "removalReason", "passwordHash", "customerId", "suspensionReason", "moderat"]) {
      assert.ok(!publicJson.toLowerCase().includes(secret.toLowerCase()), `public data must not contain "${secret}"`);
    }
    const profile = await f.m.getPublicProfile((await f.db.forumProfile.findUniqueOrThrow({ where: { customerId: a.id } })).handle);
    assert.deepEqual(Object.keys(profile).sort(), ["bio", "commentCount", "handle", "joined", "postCount", "posts"]);

    // Activity is private to its owner and built from real rows.
    const activity = await f.m.getActivity(a.id);
    assert.equal(activity.counts.published, 1);
    assert.equal((await f.m.getActivity(b.id)).posts.length, 0);

    // Profile name rules.
    await assert.rejects(f.m.updateOwnProfile(a.id, { handle: "admin" }), (e: Error) => e.name === "ZodError", "reserved names are refused");
    await assert.rejects(f.m.updateOwnProfile(a.id, { handle: "Bad Name!" }), (e: Error) => e.name === "ZodError");
    assert.equal((await f.m.updateOwnProfile(a.id, { handle: "alice_k", bio: "Phone nerd" })).handle, "alice_k");
    assert.equal(await status(f.m.updateOwnProfile(b.id, { handle: "alice_k" })), 409, "names are unique");
  } finally { await f.wipe(); await f.m.disconnectDatabase(); }
});

test("votes: one per member, changeable, concurrency-safe, and the score always equals the stored votes", { skip }, async () => {
  const f = await setup();
  try {
    await f.community();
    const author = await f.member();
    const voters = [await f.member(), await f.member(), await f.member(), await f.member()];
    const post = await f.m.createPost(author.id, f.discussion());
    const score = async () => (await f.db.forumPost.findUniqueOrThrow({ where: { id: post.id } })).score;
    const sum = async () => (await f.db.forumPostVote.aggregate({ where: { postId: post.id }, _sum: { value: true } }))._sum.value ?? 0;

    assert.equal(await status(f.m.votePost(author.id, post.slug, { value: 1 })), 403, "no voting on your own post");
    await assert.rejects(f.m.votePost(voters[0].id, post.slug, { value: 5 }), (e: Error) => e.name === "ZodError");
    assert.equal((await f.m.votePost(voters[0].id, post.slug, { value: 1 })).score, 1);
    assert.equal((await f.m.votePost(voters[0].id, post.slug, { value: 1 })).score, 1, "repeating a vote changes nothing");
    assert.equal((await f.m.votePost(voters[0].id, post.slug, { value: -1 })).score, -1, "changing a vote swaps it");
    assert.equal((await f.m.clearPostVote(voters[0].id, post.slug)).score, 0);
    assert.equal(await f.db.forumPostVote.count({ where: { postId: post.id } }), 0);

    // Same member, many simultaneous requests: still exactly one vote row.
    await Promise.all(Array.from({ length: 8 }, () => f.m.votePost(voters[1].id, post.slug, { value: 1 }).catch(() => null)));
    assert.equal(await f.db.forumPostVote.count({ where: { postId: post.id, profileId: (await f.db.forumProfile.findUniqueOrThrow({ where: { customerId: voters[1].id } })).id } }), 1);
    // Different members at once, mixed directions.
    await Promise.all([f.m.votePost(voters[2].id, post.slug, { value: 1 }), f.m.votePost(voters[3].id, post.slug, { value: -1 }), f.m.votePost(voters[0].id, post.slug, { value: 1 })]);
    assert.equal(await score(), await sum(), "score equals the sum of stored votes");

    // Comment votes follow the same rules.
    const comment = await f.m.createComment(voters[0].id, post.slug, { body: "Worth a look." });
    assert.equal((await f.m.voteComment(voters[1].id, comment.id, { value: 1 })).score, 1);
    assert.equal(await status(f.m.voteComment(voters[0].id, comment.id, { value: 1 })), 403);
  } finally { await f.wipe(); await f.m.disconnectDatabase(); }
});

test("comments: bounded nesting, locked posts, tombstones and counts", { skip }, async () => {
  const f = await setup();
  try {
    await f.community();
    const a = await f.member(), b = await f.member();
    const post = await f.m.createPost(a.id, f.discussion());
    const top = await f.m.createComment(b.id, post.slug, { body: "Top level" });
    const reply = await f.m.createComment(a.id, post.slug, { body: "Reply one", parentId: top.id });
    const deep = await f.m.createComment(b.id, post.slug, { body: "Reply two", parentId: reply.id });
    assert.equal(deep.depth, 2);
    assert.equal(await status(f.m.createComment(a.id, post.slug, { body: "Too deep now", parentId: deep.id })), 400, "nesting stops at the documented depth");
    assert.equal(await status(f.m.createComment(a.id, post.slug, { body: "Wrong post", parentId: "nonexistent" })), 404);
    assert.equal((await f.db.forumPost.findUniqueOrThrow({ where: { id: post.id } })).commentCount, 3);

    const listed = await f.m.listComments(post.slug, undefined, null);
    assert.equal(listed.items.length, 3);
    assert.ok(listed.items.every((c) => c.author?.handle && !("authorId" in c)));

    await f.m.deleteComment(b.id, top.id);
    const afterDelete = (await f.m.listComments(post.slug, undefined, null)).items.find((c) => c.id === top.id)!;
    assert.equal(afterDelete.body, null, "deleted comments keep their place but lose their text");
    assert.equal(afterDelete.author, null);
    assert.equal((await f.db.forumPost.findUniqueOrThrow({ where: { id: post.id } })).commentCount, 2);

    const v = (await f.db.forumPost.findUniqueOrThrow({ where: { id: post.id } })).version;
    await f.m.actOnPost(f.actor, post.id, "lock", { version: v, reason: "Too heated for now" });
    assert.equal(await status(f.m.createComment(b.id, post.slug, { body: "Posting on a locked thread" })), 409);
  } finally { await f.wipe(); await f.m.disconnectDatabase(); }
});

test("reports and moderation: duplicates collapse, outcomes are atomic with history, races have one winner", { skip }, async () => {
  const f = await setup();
  try {
    await f.community();
    const a = await f.member(), b = await f.member(), c = await f.member();
    const post = await f.m.createPost(a.id, f.discussion());
    const comment = await f.m.createComment(c.id, post.slug, { body: "Buy from my cousin's shop instead." });

    assert.equal(await status(f.m.reportContent(a.id, { targetType: "POST", targetId: post.id, category: "SPAM" })), 400, "cannot report yourself");
    assert.equal((await f.m.reportContent(b.id, { targetType: "POST", targetId: post.id, category: "SPAM", details: "Looks fake" })).duplicate, false);
    assert.equal((await f.m.reportContent(b.id, { targetType: "POST", targetId: post.id, category: "SCAM" })).duplicate, true, "the same member cannot file the same report twice");
    await f.m.reportContent(b.id, { targetType: "COMMENT", targetId: comment.id, category: "SPAM" });
    assert.equal(await f.db.forumReport.count(), 2);
    await assert.rejects(f.m.reportContent(b.id, { targetType: "POST", targetId: post.id, category: "NOPE" }), (e: Error) => e.name === "ZodError");

    const reports = await f.m.listReports(f.actor, "OPEN");
    assert.equal(reports.total, 2);
    const postReport = reports.items.find((r) => r.targetType === "POST")!;

    // Two moderators remove the same comment at the same moment: exactly one wins, exactly one history row.
    const results = await Promise.all([f.m.actOnComment(f.actor, comment.id, "remove", { reason: "Spam link to a private shop" }).then(() => 200, (e: { status: number }) => e.status), f.m.actOnComment(f.actor, comment.id, "remove", { reason: "Spam link to a private shop" }).then(() => 200, (e: { status: number }) => e.status)]);
    assert.deepEqual(results.sort(), [200, 409]);
    assert.equal(await f.db.forumModerationAction.count({ where: { commentId: comment.id } }), 1);
    assert.equal(await f.db.auditEvent.count({ where: { action: "community.comment.remove", targetId: comment.id } }), 1, "audit event written with the change");
    assert.equal((await f.m.listComments(post.slug, undefined, null)).items[0].body, null);

    await f.m.actOnPost(f.actor, post.id, "remove", { version: 1, reason: "Reported as spam and confirmed" });
    assert.equal(await status(f.m.getPost(post.slug, null)), 404, "removed posts disappear");
    const own = await f.m.getPost(post.id, a.id).catch((e) => e);
    assert.equal((own as { status?: number }).status, 404, "removed posts are not served as pages even to the author");
    const activity = await f.m.getActivity(a.id);
    assert.equal(activity.posts[0].viewer?.removalReason, "Reported as spam and confirmed", "the author sees why");
    assert.equal(await status(f.m.actOnPost(f.actor, post.id, "remove", { version: 2, reason: "Removing a second time" })), 409);

    await f.m.resolveReport(f.actor, postReport.id, { version: postReport.version, outcome: "RESOLVED", resolution: "Post removed" });
    assert.equal(await status(f.m.resolveReport(f.actor, postReport.id, { version: postReport.version, outcome: "DISMISSED", resolution: "Second try here" })), 409);
    const mineAfter = (await f.m.getActivity(b.id)).reports;
    assert.ok(mineAfter.some((r) => r.status === "RESOLVED"), "the reporter can see the outcome of their own report");
    assert.ok(!JSON.stringify(mineAfter).includes("Post removed"), "but not the moderator's notes");

    await f.m.actOnPost(f.actor, post.id, "restore", { version: 2, reason: "Wrongly removed, restoring" });
    assert.equal((await f.m.getPost(post.slug, null)).slug, post.slug);
  } finally { await f.wipe(); await f.m.disconnectDatabase(); }
});

test("suspension blocks every write, the kill switch makes the community read-only, and no forum action touches official deals", { skip }, async () => {
  const f = await setup();
  try {
    await f.community();
    const a = await f.member(), b = await f.member();
    const post = await f.m.createPost(a.id, f.deal({ url: "https://www.example-store.in/p/official-lookalike" }));
    const dealsBefore = await f.db.deal.count(), clicksBefore = await f.db.affiliateClick.count();
    const profile = await f.db.forumProfile.findUniqueOrThrow({ where: { customerId: b.id } }).catch(async () => f.m.ensureProfile(b.id));

    await f.m.setMemberStatus(f.actor, profile.id, "suspend", { reason: "Repeated spam links", days: 7 });
    assert.equal(await status(f.m.createPost(b.id, f.discussion("Suspended but trying anyway"))), 403);
    assert.equal(await status(f.m.createComment(b.id, post.slug, { body: "still trying to comment" })), 403);
    assert.equal(await status(f.m.votePost(b.id, post.slug, { value: 1 })), 403);
    assert.equal(await status(f.m.setSaved(b.id, post.slug, true)), 403);
    assert.equal(await status(f.m.reportContent(b.id, { targetType: "POST", targetId: post.id, category: "SPAM" })), 403);
    assert.equal(await status(f.m.setMemberStatus(f.actor, profile.id, "suspend", { reason: "Suspending a second time" })), 409);
    await f.m.setMemberStatus(f.actor, profile.id, "restore", { reason: "Appeal accepted" });
    assert.equal((await f.m.votePost(b.id, post.slug, { value: 1 })).score, 1);

    process.env.COMMUNITY_WRITES_DISABLED = "true";
    try {
      assert.equal(await status(f.m.createPost(a.id, f.discussion("Written during the freeze"))), 503);
      assert.equal(await status(f.m.votePost(b.id, post.slug, { value: -1 })), 503);
      assert.equal((await f.m.listFeed({}, null)).items.length, 1, "reading still works");
    } finally { delete process.env.COMMUNITY_WRITES_DISABLED; }

    // A deal post, its votes and its approval never create, change or publish an official deal, or an affiliate click.
    assert.equal(await f.db.deal.count(), dealsBefore);
    assert.equal(await f.db.affiliateClick.count(), clicksBefore);
    assert.equal(post.userReported, true, "deal posts are always labelled as user-reported");
  } finally { await f.wipe(); await f.m.disconnectDatabase(); }
});

test("feeds use stable cursor pagination for new and top, plus saves and follows", { skip }, async () => {
  const f = await setup();
  try {
    await f.community(); await f.community("electronics");
    const authors = [await f.member(), await f.member(), await f.member()];
    const created: string[] = [];
    for (let i = 0; i < 7; i++) created.push((await f.m.createPost(authors[i % 3].id, f.discussion(`Thread number ${i} about phones`, { communitySlug: i % 2 ? "electronics" : "general", body: `Body ${i} with enough words to pass` }))).id);
    const voter = await f.member();
    await f.m.votePost(voter.id, created[2], { value: 1 }); await f.m.votePost(voter.id, created[4], { value: 1 });
    for (const sort of ["new", "top"]) {
      const seen: string[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 5; page++) {
        const result = await f.m.listFeed({ sort, limit: 3, ...(cursor ? { cursor } : {}) }, null);
        seen.push(...result.items.map((p) => p.id));
        if (!result.nextCursor) break;
        cursor = result.nextCursor;
      }
      assert.equal(seen.length, 7, `${sort}: every post appears once`);
      assert.equal(new Set(seen).size, 7, `${sort}: no duplicates across pages`);
    }
    assert.deepEqual((await f.m.listFeed({ sort: "top", limit: 2 }, null)).items.map((p) => p.score), [1, 1]);
    assert.equal((await f.m.listFeed({ community: "electronics" }, null)).items.length, 3);
    assert.equal((await f.m.listFeed({ type: "DEAL" }, null)).items.length, 0);

    await f.m.setSaved(voter.id, created[0], true); await f.m.setSaved(voter.id, created[0], true);
    assert.equal(await f.db.forumSave.count(), 1, "saving twice keeps one row");
    assert.equal((await f.m.getActivity(voter.id)).saved.length, 1);
    assert.equal((await f.m.getActivity(authors[0].id)).saved.length, 0, "saved posts are private");
    await f.m.setFollowing(voter.id, "electronics", true);
    assert.equal((await f.m.listCommunities(voter.id)).find((c) => c.slug === "electronics")?.following, true);
    assert.equal((await f.m.listCommunities(null)).find((c) => c.slug === "electronics")?.following, false);
  } finally { await f.wipe(); await f.m.disconnectDatabase(); }
});
