import assert from "node:assert/strict";
import test from "node:test";

// Needs a DISPOSABLE migrated database (name contains "test"); run alone because it empties the forum tables:
// DISCUSSIONS_TEST_DB=1 DATABASE_URL=... node --test --test-force-exit tests/community-composer.test.ts
const databaseUrl = process.env.DATABASE_URL ?? "";
const safe = /\/[^/?]*test[^/?]*(\?|$)/i.test(databaseUrl);
const skip = process.env.DISCUSSIONS_TEST_DB === "1" && safe ? false : "set DISCUSSIONS_TEST_DB=1 and point DATABASE_URL at a disposable database whose name contains 'test'";
process.env.COMMUNITY_ENABLED = "true";
process.env.NEXTAUTH_SECRET ??= "test-nextauth-secret-0123456789abcdef0123";
process.env.NEXTAUTH_URL ??= "http://localhost:4123";
process.env.AUTH_SESSION_SECRET ??= "test-session-secret-0123456789abcdef0123";
process.env.AUTH_TOTP_ENCRYPTION_KEY ??= "dGVzdC10b3RwLWtleS1mb3ItYW5hbHl0aWNzLXRlc3Q=";
process.env.AUTH_BOOTSTRAP_EMAIL ??= "test@example.com";

test("rich text: scripts, event handlers, unsafe links and styles never survive; formatting and https links do", { skip }, async () => {
  const { sanitizeRichHtml, htmlToText, prepareRichBody } = await import("../src/server/community/richtext");
  const dirty = [
    '<p onclick="steal()">Hello <script>alert(1)</script><strong>bold</strong></p>',
    '<img src=x onerror="alert(2)">',
    '<a href="javascript:alert(3)">js link</a>',
    '<a href="http://insecure.example/">http link</a>',
    '<a href="https://www.store.in/p?x=1" onclick="x()" style="color:red">good link</a>',
    '<iframe src="https://evil.example"></iframe><style>body{display:none}</style>',
    '<h1>Big</h1><ul><li>one</li></ul>',
  ].join("");
  const clean = sanitizeRichHtml(dirty);
  for (const bad of ["<script", "onclick", "onerror", "javascript:", "<img", "<iframe", "<style", "http://insecure", "style="]) assert.ok(!clean.includes(bad), `${bad} removed`);
  assert.ok(clean.includes("<strong>bold</strong>"), "formatting kept");
  assert.match(clean, /<a href="https:\/\/www\.store\.in\/p\?x=1" rel="nofollow ugc noopener noreferrer" target="_blank">good link<\/a>/);
  assert.ok(clean.includes("<h2>Big</h2>") && clean.includes("<li>one</li>"), "headings and lists kept (h1 becomes h2)");
  assert.ok(clean.includes("js link") && clean.includes("http link"), "the words of a refused link stay, the link does not");
  assert.equal(htmlToText("<p>a &amp; b</p><p>c</p>"), "a & b\n\nc");
  assert.ok(prepareRichBody("<p>" + "x".repeat(50) + "</p>").text.length === 50);
});

test("composer: pictures are decoded and re-encoded, drafts and staged pictures are private, posts take only the author's own pictures", { skip }, async () => {
  await import("dotenv/config");
  process.env.COMMUNITY_ENABLED = "true";
  const sharp = (await import("sharp")).default;
  const { getDatabase } = await import("../src/server/db/client");
  const s = await import("../src/server/community/service");
  const c = await import("../src/server/community/composer");
  const db = getDatabase();
  const wipe = async () => {
    await db.forumPostImage.deleteMany({}); await db.forumPostDraft.deleteMany({}); await db.forumSave.deleteMany({}); await db.forumPostVote.deleteMany({});
    for (let depth = 3; depth >= 0; depth--) await db.forumComment.deleteMany({ where: { depth } });
    await db.forumPost.deleteMany({}); await db.forumProfile.deleteMany({});
    await db.customer.deleteMany({ where: { email: { startsWith: "zzcomp-" } } }); await db.forumCommunity.deleteMany({}); await db.customerRateLimit.deleteMany({});
  };
  await wipe();
  try {
    const stamp = Date.now().toString(36);
    const mk = (n: number) => db.customer.create({ data: { name: `Real ${n}`, email: `zzcomp-${stamp}-${n}@example.com`, emailVerifiedAt: new Date(), createdAt: new Date(Date.now() - 3 * 86_400_000) } });
    const [a, b] = [await mk(1), await mk(2)];
    await s.listCommunities(null);
    const png = (color: string) => sharp({ create: { width: 64, height: 48, channels: 3, background: color } }).png().toBuffer();

    // Pictures
    const one = await c.stageImage(a.id, await png("#ff0000")), two = await c.stageImage(a.id, await png("#00ff00"));
    assert.ok(one.url.startsWith("/api/v1/community/images/") && !one.url.includes("storage"), "no storage path is exposed");
    await assert.rejects(() => c.stageImage(a.id, Buffer.from("<?php echo 1; ?>")), /JPEG, PNG or WebP/);
    await assert.rejects(() => c.stageImage(a.id, Buffer.from("GIF89a-not-really")), /JPEG, PNG or WebP/);
    await assert.rejects(() => c.stageImage(a.id, Buffer.alloc(5 * 1024 * 1024 + 1)), { status: 413 });
    const stored = await db.forumPostImage.findUniqueOrThrow({ where: { id: one.id } });
    assert.equal(stored.postId, null); assert.ok(stored.bytes > 0);
    // Staged pictures: owner only
    assert.ok((await c.readPostImage(one.id, a.id)).bytes.length > 0, "the owner can see their staged picture");
    await assert.rejects(() => c.readPostImage(one.id, b.id), { status: 404 });
    await assert.rejects(() => c.readPostImage(one.id, null), { status: 404 });
    await assert.rejects(() => c.removeStagedImage(b.id, one.id), { status: 404 });
    // At most three waiting pictures (two are already waiting)
    await c.stageImage(a.id, await png("#0000ff"));
    await assert.rejects(async () => c.stageImage(a.id, await png("#123456")), /up to 3/);

    // Drafts: private and replaceable
    await c.saveDraft(a.id, { type: "QUESTION", communitySlug: "off-topic", title: "Work in progress", bodyHtml: "<p>draft</p>", imageIds: [one.id] });
    assert.equal((await c.getDraft(a.id))?.draft.title, "Work in progress");
    assert.deepEqual((await c.getDraft(a.id))?.images.map((i) => i.id), [one.id]);
    await s.ensureProfile(b.id);
    assert.equal(await c.getDraft(b.id), null, "customer B cannot see customer A's draft");
    await c.saveDraft(a.id, { title: "Second version" });
    assert.equal((await c.getDraft(a.id))?.draft.title, "Second version", "one draft per member, replaced in place");
    assert.equal(await db.forumPostDraft.count(), 1);
    await assert.rejects(() => c.saveDraft(a.id, { title: "x".repeat(500) }));

    // Posting: sanitized HTML, ordered pictures, own pictures only
    await assert.rejects(() => s.createPost(b.id, { type: "DISCUSSION", communitySlug: "off-topic", title: "Stealing a picture", bodyHtml: "<p>Trying to use someone else's picture</p>", imageIds: [two.id] }), { status: 409 });
    const post = await s.createPost(a.id, {
      type: "DISCUSSION", communitySlug: "off-topic", title: "Which air fryer is best?", notifyReplies: true,
      bodyHtml: '<p>I want an air fryer <strong>under 8000</strong> <script>alert(1)</script><a href="javascript:x()">link</a></p>', imageIds: [two.id, one.id],
    });
    assert.deepEqual(post.images.map((i) => i.id), [two.id, one.id], "pictures keep the order chosen");
    assert.ok(post.bodyHtml && !post.bodyHtml.includes("<script") && !post.bodyHtml.includes("javascript:"));
    assert.match(post.body, /I want an air fryer under 8000/);
    assert.equal(await c.getDraft(a.id), null, "the draft is removed once the post is published");
    assert.equal((await db.forumPost.findUniqueOrThrow({ where: { id: post.id } })).notifyReplies, true);
    assert.ok((await c.readPostImage(two.id, null)).isPublic, "a published post's pictures are public");
    await assert.rejects(() => s.createPost(a.id, { type: "DISCUSSION", communitySlug: "off-topic", title: "Which air fryer is best?", bodyHtml: '<p>I want an air fryer <strong>under 8000</strong> <script>alert(1)</script><a href="javascript:x()">link</a></p>' }), { status: 409 });
    await assert.rejects(() => s.createPost(a.id, { type: "DISCUSSION", communitySlug: "off-topic", title: "Too long", bodyHtml: "<p>" + "x".repeat(5001) + "</p>" }), /too long/);
    await assert.rejects(() => s.createPost(a.id, { type: "DISCUSSION", communitySlug: "off-topic", title: "T".repeat(121), bodyHtml: "<p>enough words here</p>" }));
    await assert.rejects(() => s.createPost(a.id, { type: "DISCUSSION", communitySlug: "off-topic", title: "Four pictures", bodyHtml: "<p>enough words here</p>", imageIds: ["1", "2", "3", "4"] }));
    // Plain-text posts (the old way) still work
    const plain = await s.createPost(b.id, { type: "DISCUSSION", communitySlug: "off-topic", title: "Plain text post", body: "No editor involved here." });
    assert.equal(plain.bodyHtml, null); assert.deepEqual(plain.images, []);
  } finally { await wipe(); }
});
