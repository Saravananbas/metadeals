import assert from "node:assert/strict";
import test from "node:test";

// Needs a DISPOSABLE migrated database (its name must contain "test"): DISCUSSIONS_TEST_DB=1 DATABASE_URL=... node --test (alone)
const databaseUrl = process.env.DATABASE_URL ?? "";
const safe = /\/[^/?]*test[^/?]*(\?|$)/i.test(databaseUrl);
const skip = process.env.DISCUSSIONS_TEST_DB === "1" && safe ? false : "set DISCUSSIONS_TEST_DB=1 (run it alone: it empties the forum tables, so not alongside the other forum tests) and point DATABASE_URL at a disposable database whose name contains 'test'";

process.env.COMMUNITY_ENABLED = "true";
process.env.NEXTAUTH_SECRET ??= "test-nextauth-secret-0123456789abcdef0123";
process.env.NEXTAUTH_URL ??= "http://localhost:4123";
process.env.AUTH_SESSION_SECRET ??= "test-session-secret-0123456789abcdef0123";
process.env.AUTH_TOTP_ENCRYPTION_KEY ??= "dGVzdC10b3RwLWtleS1mb3ItYW5hbHl0aWNzLXRlc3Q=";
process.env.AUTH_BOOTSTRAP_EMAIL ??= "test@example.com";

test("discussion list: real filters, sorting, search, paging, my views, counts and view counting", { skip }, async () => {
  await import("dotenv/config");
  process.env.COMMUNITY_ENABLED = "true";
  const { getDatabase } = await import("../src/server/db/client");
  const s = await import("../src/server/community/service");
  const db = getDatabase();
  const wipe = async () => {
    await db.forumSave.deleteMany({}); await db.forumPostVote.deleteMany({}); await db.forumFollow.deleteMany({});
    for (let depth = 3; depth >= 0; depth--) await db.forumComment.deleteMany({ where: { depth } });
    await db.forumPost.deleteMany({}); await db.forumProfile.deleteMany({});
    await db.customer.deleteMany({ where: { email: { startsWith: "zzdisc-" } } });
    await db.forumCommunity.deleteMany({}); await db.customerRateLimit.deleteMany({});
  };
  await wipe();
  try {
    const stamp = Date.now().toString(36);
    const mk = async (n: number) => db.customer.create({ data: { name: `Real ${n}`, email: `zzdisc-${stamp}-${n}@example.com`, emailVerifiedAt: new Date(), createdAt: new Date(Date.now() - 3 * 86_400_000) } });
    const [a, b] = [await mk(1), await mk(2)];
    const pa = await s.ensureProfile(a.id), pb = await s.ensureProfile(b.id);
    await s.listCommunities(null); // creates the five general areas
    const slugs = (await s.listCommunities(null)).map((c) => c.slug);
    for (const slug of ["announcements", "deals-discussions", "help-support", "feedback-ideas", "off-topic"]) assert.ok(slugs.includes(slug), `${slug} exists`);

    const day = 86_400_000, now = Date.now();
    const com = await db.forumCommunity.findFirstOrThrow({ where: { slug: "deals-discussions" } });
    const help = await db.forumCommunity.findFirstOrThrow({ where: { slug: "help-support" } });
    const mkPost = (title: string, o: Record<string, unknown>) => db.forumPost.create({ data: { slug: `${title.toLowerCase().replace(/\W+/g, "-")}-${stamp}`, communityId: com.id, authorId: pa.id, type: "DISCUSSION", title, body: `body of ${title}`, contentHash: title.padEnd(64, "x").slice(0, 64), status: "PUBLISHED", publishedAt: new Date(now - day), ...o } as never });
    const old = await mkPost("Old quiet post", { publishedAt: new Date(now - 30 * day) });
    const liked = await mkPost("Liked laptop thread", { score: 9, publishedAt: new Date(now - 20 * day) });
    const talked = await mkPost("Chatty phone thread", { commentCount: 7, viewCount: 3, publishedAt: new Date(now - 2 * day) });
    const viewed = await mkPost("Viewed earbuds thread", { viewCount: 99, publishedAt: new Date(now - 3 * day) });
    const hidden = await mkPost("Pending review post", { status: "PENDING_REVIEW", publishedAt: null });
    const other = await db.forumPost.create({ data: { slug: `help-${stamp}`, communityId: help.id, authorId: pb.id, type: "QUESTION", title: "How do I reset my password", body: "I forgot it", contentHash: "h".repeat(64), status: "PUBLISHED", publishedAt: new Date(now - 10 * day) } });

    const titles = async (q: Record<string, unknown>, who: string | null = null) => (await s.listDiscussions(q, who)).items.map((p) => p.title);
    // Latest: newest first, only published
    const latest = await titles({});
    assert.equal(latest[0], "Chatty phone thread");
    assert.ok(!latest.includes("Pending review post"), "posts waiting for review stay hidden from everyone");
    // Trending: last 7 days only, ordered by engagement
    assert.deepEqual((await titles({ filter: "trending" })).sort(), ["Chatty phone thread", "Viewed earbuds thread"].sort());
    // Most liked / commented
    assert.equal((await titles({ filter: "liked" }))[0], "Liked laptop thread");
    assert.equal((await titles({ filter: "commented" }))[0], "Chatty phone thread");
    // Unanswered: no comments
    assert.ok(!(await titles({ filter: "unanswered" })).includes("Chatty phone thread"));
    // Sorting
    assert.equal((await titles({ sort: "viewed" }))[0], "Viewed earbuds thread");
    const oldestFirst = await titles({ sort: "oldest" });
    assert.equal(oldestFirst[0], "Old quiet post");
    // Category filter
    assert.deepEqual(await titles({ community: "help-support" }), ["How do I reset my password"]);
    assert.equal((await s.listDiscussions({ type: "QUESTION" }, null)).total, 1);
    // Search: title, body, author handle and category name; wildcards do not widen it
    assert.deepEqual(await titles({ q: "earbuds" }), ["Viewed earbuds thread"]);
    assert.deepEqual(await titles({ q: "forgot it" }), ["How do I reset my password"]);
    assert.ok((await titles({ q: pb.handle })).includes("How do I reset my password"));
    assert.deepEqual(await titles({ q: "%" }), latest, "a lone wildcard is removed, not treated as match-everything-different");
    assert.equal((await s.listDiscussions({ q: "no-such-thing-xyz" }, null)).total, 0);
    // Paging is real: limit 2 gives 3 pages for 5 posts and does not repeat items
    const p1 = await s.listDiscussions({ limit: 2, page: 1 }, null), p3 = await s.listDiscussions({ limit: 2, page: 3 }, null);
    assert.equal(p1.total, 5); assert.equal(p1.pageCount, 3); assert.equal(p1.items.length, 2); assert.equal(p3.items.length, 1);
    assert.ok(!p1.items.some((i) => p3.items.some((j) => j.id === i.id)));
    // My views need a session; guests are told to sign in
    assert.equal((await s.listDiscussions({ view: "mine" }, null)).requiresSignIn, true);
    assert.ok((await titles({ view: "mine" }, a.id)).includes("Pending review post"), "authors see their own pending post");
    assert.ok(!(await titles({ view: "mine" }, b.id)).includes("Old quiet post"), "customer B does not see customer A's posts under My discussions");
    // Saved and following
    await s.setSaved(b.id, talked.slug, true);
    assert.deepEqual(await titles({ view: "saved" }, b.id), ["Chatty phone thread"]);
    assert.deepEqual(await titles({ view: "saved" }, a.id), [], "saved posts are private to the member");
    await s.setFollowing(b.id, "help-support", true);
    assert.deepEqual(await titles({ view: "following" }, b.id), ["How do I reset my password"]);
    // Statistics are counted, not invented
    const o = await s.communityOverview(b.id);
    assert.equal(o.stats.members, 2); assert.equal(o.stats.discussions, 5); assert.equal(o.stats.comments, 0);
    assert.equal(o.mine?.saved, 1); assert.equal(o.mine?.following, 1);
    assert.ok(o.trendingTopics.length > 0 && o.trendingTopics.every((t) => t.posts > 0));
    // Views: counted once per visitor, bots ignored, unknown or hidden posts refused
    const v1 = await s.recordPostView(old.slug, { ip: "203.0.113.5", userAgent: "Mozilla/5.0 test" });
    const v2 = await s.recordPostView(old.slug, { ip: "203.0.113.5", userAgent: "Mozilla/5.0 test" });
    const v3 = await s.recordPostView(old.slug, { ip: "203.0.113.5", userAgent: "Googlebot/2.1" });
    const v4 = await s.recordPostView(old.slug, { ip: "203.0.113.9", userAgent: "Mozilla/5.0 test" });
    assert.deepEqual([v1.counted, v2.counted, v3.counted, v4.counted], [true, false, false, true]);
    assert.equal((await db.forumPost.findUniqueOrThrow({ where: { id: old.id } })).viewCount, 2);
    await assert.rejects(() => s.recordPostView(hidden.slug, { ip: "203.0.113.5", userAgent: "Mozilla/5.0 test" }), { status: 404 });
    void liked; void other;
  } finally { await wipe(); }
});
