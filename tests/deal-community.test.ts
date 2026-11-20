import assert from "node:assert/strict";
import test from "node:test";

// Disposable database only: DEAL_COMMUNITY_TEST_DB=1 DATABASE_URL=mysql://...metadeals_modtest node --conditions=react-server --import tsx --test --test-force-exit tests/deal-community.test.ts
const databaseUrl = process.env.DATABASE_URL ?? "";
const safe = /\/[^/?]*test[^/?]*(\?|$)/i.test(databaseUrl);
const skip = process.env.DEAL_COMMUNITY_TEST_DB === "1" && safe ? false : "set DEAL_COMMUNITY_TEST_DB=1 and point DATABASE_URL at a disposable database whose name contains 'test'";
process.env.COMMUNITY_ENABLED = "true";
process.env.NEXTAUTH_SECRET ??= "test-nextauth-secret-0123456789abcdef0123";
process.env.NEXTAUTH_URL ??= "http://localhost:4123";
process.env.AUTH_SESSION_SECRET ??= "test-session-secret-0123456789abcdef0123";
process.env.AUTH_TOTP_ENCRYPTION_KEY ??= "dGVzdC10b3RwLWtleS1mb3ItYW5hbHl0aWNzLXRlc3Q=";
process.env.AUTH_BOOTSTRAP_EMAIL ??= "test@example.com";

test("deal votes, dislike reasons, notes, comment likes and member stars", { skip }, async () => {
  const { getDatabase } = await import("../src/server/db/client");
  const votes = await import("../src/server/deals/votes");
  const actions = await import("../src/server/deals/comment-actions");
  const profile = await import("../src/server/community/profile");
  const service = await import("../src/server/community/service");
  const db = getDatabase();
  const stamp = Date.now().toString(36);
  const mk = (n: number) => db.customer.create({ data: { name: `Real ${n}`, email: `zzdealcom-${stamp}-${n}@example.com`, emailVerifiedAt: new Date(), createdAt: new Date(Date.now() - 3 * 86_400_000) } });
  const [a, b] = [await mk(1), await mk(2)];
  const boss = await db.user.create({ data: { email: `zzdealcom-${stamp}@example.test`, role: "ADMIN", status: "ACTIVE", name: "Fixture" } });
  const category = await db.category.create({ data: { slug: `zzdealcom-${stamp}`, name: "Fixture" } });
  const merchant = await db.merchant.create({ data: { slug: `zzdealcom-${stamp}`, name: "Fixture", websiteUrl: "https://amazon.in" } });
  const media = await db.media.create({ data: { storageKey: `${stamp}.webp`, provider: "local", mimeType: "image/webp", byteSize: 1, width: 1, height: 1, alt: "Fixture", uploadedById: boss.id } });
  const deal = await db.deal.create({ data: { slug: `zzdealcom-${stamp}`, title: "Fixture deal", brand: "Fixture", description: "Fixture", categoryId: category.id, merchantId: merchant.id, mediaId: media.id, mrpMinor: 1000, priceMinor: 500, productUrl: "https://amazon.in/dp/B000000000", status: "PUBLISHED", everPublished: true, publishedAt: new Date(Date.now() - 1000), createdById: boss.id, updatedById: boss.id } });
  try {
    // Votes: one per member, switching replaces, clearing removes, the reason is kept only on a down vote
    assert.deepEqual(await votes.castVote(a.id, deal.slug, { value: 1 }), { score: 1, up: 1, down: 0, mine: 1 });
    assert.deepEqual(await votes.castVote(a.id, deal.slug, { value: 1 }), { score: 1, up: 1, down: 0, mine: 1 }, "voting twice counts once");
    assert.equal((await votes.castVote(b.id, deal.slug, { value: -1, reason: "Spam" })).score, 0);
    assert.equal((await db.dealVote.findFirstOrThrow({ where: { customerId: b.id } })).reason, "Spam");
    await votes.castVote(b.id, deal.slug, { value: 1 });
    assert.equal((await db.dealVote.findFirstOrThrow({ where: { customerId: b.id } })).reason, null, "an up vote drops the reason");
    assert.equal((await votes.castVote(b.id, deal.slug, { value: 0 })).up, 1);
    assert.equal((await votes.voteSummary(deal.slug, null)).mine, 0, "a visitor sees the score but no own vote");
    await assert.rejects(() => votes.castVote(a.id, deal.slug, { value: -1, reason: "Because" }), "only the listed reasons are accepted");
    await assert.rejects(() => votes.castVote(a.id, deal.slug, { value: 5 }));
    await assert.rejects(() => votes.castVote(a.id, "no-such-deal", { value: 1 }), { status: 404 });

    // Notes: trimmed plain text, length rules, only the author can remove their own
    const note = await votes.addNote(a.id, deal.slug, { content: "  Extra 5% with HDFC cards  " });
    assert.equal(note.content, "Extra 5% with HDFC cards");
    await assert.rejects(() => votes.addNote(a.id, deal.slug, { content: "ab" }), /at least 3/);
    await assert.rejects(() => votes.addNote(a.id, deal.slug, { content: "x".repeat(501) }), /under 500/);
    assert.equal((await votes.listNotes(deal.slug, b.id)).length, 1);
    await assert.rejects(() => votes.removeNote(b.id, note.id), { status: 404 });
    await votes.removeNote(a.id, note.id);
    assert.equal((await votes.listNotes(deal.slug, a.id)).length, 0);

    // Comment likes: one per member, unliking restores the count
    const comment = await db.dealComment.create({ data: { dealId: deal.id, customerId: a.id, authorName: "member", content: "A member comment" } });
    assert.deepEqual(await actions.setCommentLike(b.id, comment.id, true), { liked: true, likes: 1 });
    assert.deepEqual(await actions.setCommentLike(b.id, comment.id, true), { liked: true, likes: 1 });
    assert.deepEqual(await actions.setCommentLike(b.id, comment.id, false), { liked: false, likes: 0 });
    await assert.rejects(() => actions.setCommentLike(b.id, "no-such-comment", true), { status: 404 });

    // Replies hang off one top-level comment
    const reply = await db.dealComment.create({ data: { dealId: deal.id, customerId: b.id, authorName: "member", content: "A reply", parentId: comment.id } });
    assert.equal(reply.parentId, comment.id);

    // Stars: one per pair, never to yourself, taken back by the giver
    await service.ensureProfile(a.id); await service.ensureProfile(b.id);
    const handleA = (await db.forumProfile.findUniqueOrThrow({ where: { customerId: a.id } })).handle;
    assert.deepEqual(await profile.setStar(b.id, handleA, true), { starred: true, stars: 1 });
    assert.deepEqual(await profile.setStar(b.id, handleA, true), { starred: true, stars: 1 }, "starring twice counts once");
    await assert.rejects(() => profile.setStar(a.id, handleA, true), { status: 404 });
    assert.deepEqual(await profile.setStar(b.id, handleA, false), { starred: false, stars: 0 });
  } finally {
    await db.deal.deleteMany({ where: { id: deal.id } });
    await db.media.deleteMany({ where: { id: media.id } });
    await db.merchant.deleteMany({ where: { id: merchant.id } });
    await db.category.deleteMany({ where: { id: category.id } });
    await db.user.deleteMany({ where: { id: boss.id } });
    await db.memberStar.deleteMany({}); await db.forumProfile.deleteMany({ where: { customerId: { in: [a.id, b.id] } } });
    await db.customer.deleteMany({ where: { id: { in: [a.id, b.id] } } });
    await db.customerRateLimit.deleteMany({});
  }
});
