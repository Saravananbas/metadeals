import assert from "node:assert/strict";
import test from "node:test";

// Disposable database only; run alone (it empties the forum tables): DISCUSSIONS_TEST_DB=1 DATABASE_URL=... node --test --test-force-exit tests/community-likes.test.ts
const databaseUrl = process.env.DATABASE_URL ?? "";
const safe = /\/[^/?]*test[^/?]*(\?|$)/i.test(databaseUrl);
const skip = process.env.DISCUSSIONS_TEST_DB === "1" && safe ? false : "set DISCUSSIONS_TEST_DB=1 and point DATABASE_URL at a disposable database whose name contains 'test'";
process.env.COMMUNITY_ENABLED = "true";
process.env.NEXTAUTH_SECRET ??= "test-nextauth-secret-0123456789abcdef0123";
process.env.NEXTAUTH_URL ??= "http://localhost:4123";
process.env.AUTH_SESSION_SECRET ??= "test-session-secret-0123456789abcdef0123";
process.env.AUTH_TOTP_ENCRYPTION_KEY ??= "dGVzdC10b3RwLWtleS1mb3ItYW5hbHl0aWNzLXRlc3Q=";
process.env.AUTH_BOOTSTRAP_EMAIL ??= "test@example.com";

test("likes, comment sorting, rich comments, ownership and edit rules on the discussion page", { skip }, async () => {
  await import("dotenv/config");
  process.env.COMMUNITY_ENABLED = "true";
  const { getDatabase } = await import("../src/server/db/client");
  const s = await import("../src/server/community/service");
  const db = getDatabase();
  const wipe = async () => {
    await db.forumPostLike.deleteMany({}); await db.forumCommentLike.deleteMany({}); await db.forumSave.deleteMany({}); await db.forumPostVote.deleteMany({}); await db.forumCommentVote.deleteMany({});
    for (let depth = 3; depth >= 0; depth--) await db.forumComment.deleteMany({ where: { depth } });
    await db.forumPost.deleteMany({}); await db.forumProfile.deleteMany({});
    await db.customer.deleteMany({ where: { email: { startsWith: "zzlike-" } } }); await db.forumCommunity.deleteMany({}); await db.customerRateLimit.deleteMany({});
  };
  await wipe();
  try {
    const stamp = Date.now().toString(36);
    const mk = (n: number) => db.customer.create({ data: { name: `Real ${n}`, email: `zzlike-${stamp}-${n}@example.com`, emailVerifiedAt: new Date(), createdAt: new Date(Date.now() - 3 * 86_400_000) } });
    const [a, b, c] = [await mk(1), await mk(2), await mk(3)];
    await s.listCommunities(null);
    const post = await s.createPost(a.id, { type: "DISCUSSION", communitySlug: "off-topic", title: "Sample discussion", bodyHtml: "<p>I love this site and want more features</p>" });

    // Post likes: one per member, repeatable calls do not double count, removal restores the count, separate from votes
    assert.deepEqual(await s.setPostLike(b.id, post.id, true), { liked: true, likeCount: 1 });
    assert.deepEqual(await s.setPostLike(b.id, post.id, true), { liked: true, likeCount: 1 }, "liking twice counts once");
    await Promise.all([s.setPostLike(c.id, post.id, true), s.setPostLike(c.id, post.id, true), s.setPostLike(c.id, post.id, true)]);
    assert.equal((await db.forumPost.findUniqueOrThrow({ where: { id: post.id } })).likeCount, 2, "parallel duplicates still count once");
    assert.equal(await db.forumPostLike.count({ where: { postId: post.id } }), 2);
    assert.deepEqual(await s.setPostLike(b.id, post.id, false), { liked: false, likeCount: 1 });
    assert.deepEqual(await s.setPostLike(b.id, post.id, false), { liked: false, likeCount: 1 }, "unliking twice does not go below the real count");
    assert.equal((await db.forumPost.findUniqueOrThrow({ where: { id: post.id } })).score, 0, "a like is not a vote");
    assert.equal((await s.getPost(post.id, c.id)).viewer?.liked, true); assert.equal((await s.getPost(post.id, b.id)).viewer?.liked, false);
    await assert.rejects(() => s.setPostLike(b.id, "no-such-post", true), { status: 404 });

    // Rich comments: sanitized, quote kept, plain text derived
    const first = await s.createComment(b.id, post.id, { bodyHtml: '<blockquote><p><strong>a wrote:</strong></p><p>I love this</p></blockquote><p>Which <em>features</em>? <script>x()</script></p>' });
    assert.ok(first.bodyHtml && first.bodyHtml.includes("<blockquote>") && !first.bodyHtml.includes("<script"));
    assert.match(first.body ?? "", /Which features\?/);
    const second = await s.createComment(c.id, post.id, { bodyHtml: "<p>A plain follow-up comment</p>" });
    const reply = await s.createComment(a.id, post.id, { bodyHtml: "<p>Notifications please</p>", parentId: first.id });
    assert.equal(reply.depth, 1); assert.equal(reply.parentId, first.id);
    await assert.rejects(() => s.createComment(b.id, post.id, { bodyHtml: "<p>" + "x".repeat(2001) + "</p>" }), /too long/);
    // Old plain-text comments still work
    const old = await s.createComment(c.id, post.id, { body: "an older style plain comment" });
    assert.equal(old.bodyHtml, null);

    // Comment likes, votes and sorting
    await s.setCommentLike(a.id, second.id, true); await s.setCommentLike(b.id, second.id, true); await s.setCommentLike(a.id, first.id, true);
    await s.voteComment(a.id, first.id, { value: 1 }); await s.voteComment(c.id, first.id, { value: 1 });
    const ids = async (sort: "newest" | "oldest" | "liked" | "upvoted", who: string | null = null) => (await s.listComments(post.id, undefined, who, sort)).items.filter((x) => x.parentId === null).map((x) => x.id);
    assert.equal((await ids("oldest"))[0], first.id);
    assert.equal((await ids("newest"))[0], old.id);
    assert.equal((await ids("liked"))[0], second.id, "most liked first");
    assert.equal((await ids("upvoted"))[0], first.id, "most upvoted first");
    const mineView = (await s.listComments(post.id, undefined, a.id, "liked")).items;
    assert.equal(mineView.find((x) => x.id === second.id)?.viewer?.liked, true); assert.equal(mineView.find((x) => x.id === first.id)?.viewer?.canEdit, false, "customer A cannot edit B's comment");
    assert.equal(mineView.find((x) => x.id === reply.id)?.viewer?.canEdit, true);
    assert.equal((await s.listComments(post.id, undefined, null, "liked")).items[0].viewer, undefined, "guests get no personal data");

    // Ownership: nobody edits or deletes someone else's comment or post
    await assert.rejects(() => s.editComment(a.id, first.id, { version: 1, bodyHtml: "<p>hijack</p>" }), { status: 404 });
    await assert.rejects(() => s.deleteComment(a.id, first.id), { status: 404 });
    await assert.rejects(() => s.editPost(b.id, post.id, { version: 1, title: "Hijacked title" }), { status: 404 });
    await assert.rejects(() => s.deletePost(b.id, post.id), { status: 404 });
    const edited = await s.editComment(b.id, first.id, { version: 1, bodyHtml: "<p>Edited <strong>comment</strong></p>" });
    assert.ok(edited.bodyHtml?.includes("<strong>comment</strong>")); assert.equal(edited.id, first.id, "editing does not create a second comment");
    assert.equal(await db.forumComment.count({ where: { postId: post.id } }), 4);
    const editedPost = await s.editPost(a.id, post.id, { version: 1, title: "Sample discussion (edited)", bodyHtml: "<p>Edited with <u>rich</u> text <script>x()</script></p>" });
    assert.equal(editedPost.title, "Sample discussion (edited)"); assert.ok(editedPost.bodyHtml && !editedPost.bodyHtml.includes("<script"));
    assert.equal(editedPost.viewer?.canEdit, true);
  } finally { await wipe(); }
});
