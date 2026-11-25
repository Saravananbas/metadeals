import assert from "node:assert/strict";
import test from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
process.env.MEDIA_DIR = join(tmpdir(), "metadeals-test-media");

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
  const boss = await db.user.create({ data: { email: `zzdealcom-${stamp}@example.test`, role: "SUPER_ADMIN", status: "ACTIVE", name: "Fixture", totpEnabledAt: new Date() } });
  const category = await db.category.create({ data: { slug: `zzdealcom-${stamp}`, name: "Fixture" } });
  const merchant = await db.merchant.create({ data: { slug: `zzdealcom-${stamp}`, name: "Fixture", websiteUrl: "https://amazon.in" } });
  const media = await db.media.create({ data: { storageKey: `${stamp}.webp`, provider: "local", mimeType: "image/webp", byteSize: 1, width: 1, height: 1, alt: "Fixture", uploadedById: boss.id } });
  const deal = await db.deal.create({ data: { slug: `zzdealcom-${stamp}`, title: "Fixture deal", brand: "Fixture", description: "Fixture", categoryId: category.id, merchantId: merchant.id, mediaId: media.id, mrpMinor: 1000, priceMinor: 500, productUrl: "https://amazon.in/dp/B000000000", status: "PUBLISHED", everPublished: true, publishedAt: new Date(Date.now() - 1000), createdById: boss.id, updatedById: boss.id } });
  const extraDealIds: string[] = [];
  try {
    // Votes: a like and a dislike are separate (neither removes the other), each counts once per member, clearing removes, the reason stays on the dislike
    assert.deepEqual(await votes.castVote(a.id, deal.slug, { value: 1 }), { score: 1, up: 1, down: 0, liked: true, disliked: false, mine: 1 });
    assert.deepEqual(await votes.castVote(a.id, deal.slug, { value: 1 }), { score: 1, up: 1, down: 0, liked: true, disliked: false, mine: 1 }, "liking twice counts once");
    assert.equal((await votes.castVote(b.id, deal.slug, { value: -1, reason: "Spam" })).score, 0);
    assert.equal((await db.dealVote.findFirstOrThrow({ where: { customerId: b.id, value: -1 } })).reason, "Spam");
    const both = await votes.castVote(b.id, deal.slug, { value: 1 });
    assert.deepEqual([both.up, both.down, both.liked, both.disliked], [2, 1, true, true], "a like does not remove the member's dislike");
    assert.equal((await db.dealVote.findFirstOrThrow({ where: { customerId: b.id, value: 1 } })).reason, null, "a like carries no reason");
    assert.deepEqual((await votes.castVote(b.id, deal.slug, { value: 0, clear: -1 })).down, 0, "clear names the kind to take back");
    assert.equal((await votes.voteSummary(deal.slug, b.id)).liked, true);
    assert.equal((await votes.castVote(b.id, deal.slug, { value: 0 })).up, 1, "value 0 alone clears both");
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

    // Duplicate check: the same Amazon product is found whatever the tracking text; the match is not repeated in the similar list
    const check = await import("../src/server/customer/deal-check");
    const dup = await check.dealCheck(a.id, { url: "https://www.amazon.in/Some-Name/dp/B000000000?ref=dlx&tag=zz&pf_rd_r=Q", title: "Fixture deal" });
    assert.equal(dup.sameLink.length, 1);
    assert.equal(dup.sameLink[0].slug, deal.slug);
    assert.equal(dup.sameLink[0].state, "LIVE");
    assert.ok(!dup.similar.some((d) => d.slug === deal.slug), "the same-link deal is not listed twice");
    await db.deal.update({ where: { id: deal.id }, data: { status: "EXPIRED" } });
    assert.equal((await check.dealCheck(a.id, { url: "https://www.amazon.in/dp/B000000000" })).sameLink[0].state, "EXPIRED", "expired deals are still reported");
    const other = await check.dealCheck(a.id, { url: "https://www.amazon.in/dp/B0AAAAAAAA", title: "zzzzqq nothing like it" });
    assert.deepEqual([other.sameLink.length, other.similar.length, other.pending], [0, 0, false]);

    // Several pictures on a submission, staff approval turning them into the deal gallery, and brands remembered on approval
    const sharp = (await import("sharp")).default;
    const png = (c: string) => sharp({ create: { width: 24, height: 24, channels: 3, background: c } }).png().toBuffer();
    const submissions = await import("../src/server/customer/submissions");
    const review = await import("../src/server/community/review");
    const brands = await import("../src/server/brands");
    const fields = { title: "Fixture submission", description: "A fixture submission description", productUrl: "https://www.example.com/p/zz-fixture", priceMinor: 50000, mrpMinor: 90000, brand: "Zz Brand", merchantName: "Fixture", categoryHint: "Fixture" };
    const sub = await submissions.createSubmission(b.id, fields, await png("#ff0000"), [await png("#00ff00"), await png("#0000ff")]);
    assert.equal(await db.communityDealSubmissionImage.count({ where: { submissionId: sub.id } }), 2);
    const mainPng = await png("#ff0000");
    await assert.rejects(() => submissions.createSubmission(b.id, { ...fields, productUrl: "https://www.example.com/p/zz-fixture-2" }, mainPng, Array.from({ length: 10 }, () => Buffer.from("x"))), /up to 10/);
    const { resolveAccess } = await import("../src/server/auth/access");
    const boss2 = { id: boss.id, role: "SUPER_ADMIN" as const, permissions: await resolveAccess(boss.id) };
    const approved = await review.approveSubmission(boss2, sub.id, { version: 1, categoryId: category.id, merchantId: merchant.id, title: fields.title, brand: fields.brand, description: fields.description, productUrl: fields.productUrl, priceMinor: 50000, mrpMinor: 90000 });
    extraDealIds.push(approved.dealId);
    assert.equal(await db.dealGalleryImage.count({ where: { dealId: approved.dealId } }), 2, "the extra pictures became the deal gallery");
    assert.equal((await brands.findBrand("ZZ  brand"))?.name, "Zz Brand", "the brand is remembered and matched whatever the capitals or spacing");
    assert.equal(await brands.findBrand("never heard of it"), null);

    // The picture proxy refuses private and non-https addresses before any download
    const proxy = await import("../src/server/customer/image-proxy");
    for (const src of ["https://127.0.0.1/a.png", "https://localhost/a.png", "https://169.254.169.254/latest/meta-data", "ftp://example.com/a.png", "not a link"]) {
      await assert.rejects(() => proxy.proxyImage(a.id, src), (e: unknown) => e instanceof Error && /could not be loaded|not valid/.test(e.message), src);
    }

    // Staff check: a draft is found by staff but never shown to members; the deal being edited is left out
    const draft = await db.deal.create({ data: { slug: `zzdealcom-${stamp}-draft`, title: "Zzdraftonly Fixture Widget", brand: "Fixture", description: "Fixture", categoryId: category.id, merchantId: merchant.id, mediaId: media.id, mrpMinor: 1000, priceMinor: 500, productUrl: "https://www.amazon.in/dp/B0DRAFT001", status: "DRAFT", createdById: boss.id, updatedById: boss.id } });
    extraDealIds.push(draft.id);
    const asStaff = await check.findDealMatches({ url: "https://www.amazon.in/x/dp/B0DRAFT001?ref=y", title: "Zzdraftonly Fixture Widget" }, true);
    assert.deepEqual(asStaff.sameLink.map((d) => [d.slug, d.state]), [[draft.slug, "DRAFT"]]);
    const asMember = await check.dealCheck(a.id, { url: "https://www.amazon.in/x/dp/B0DRAFT001?ref=y", title: "Zzdraftonly Fixture Widget" });
    assert.deepEqual([asMember.sameLink.length, asMember.similar.length], [0, 0], "members never learn about drafts");
    assert.equal((await check.findDealMatches({ url: "https://www.amazon.in/dp/B0DRAFT001", excludeDealId: draft.id }, true)).sameLink.length, 0, "the deal being edited is not its own duplicate");

    // Stars: one per pair, never to yourself, taken back by the giver
    await service.ensureProfile(a.id); await service.ensureProfile(b.id);
    const handleA = (await db.forumProfile.findUniqueOrThrow({ where: { customerId: a.id } })).handle;
    assert.deepEqual(await profile.setStar(b.id, handleA, true), { starred: true, stars: 1 });
    assert.deepEqual(await profile.setStar(b.id, handleA, true), { starred: true, stars: 1 }, "starring twice counts once");
    await assert.rejects(() => profile.setStar(a.id, handleA, true), { status: 404 });
    assert.deepEqual(await profile.setStar(b.id, handleA, false), { starred: false, stars: 0 });
  } finally {
    await db.communityDealSubmission.deleteMany({ where: { customerId: { in: [a.id, b.id] } } });
    await db.brand.deleteMany({ where: { slug: "zz-brand" } });
    await db.deal.deleteMany({ where: { id: { in: [deal.id, ...extraDealIds] } } });
    await db.media.deleteMany({ where: { id: media.id } });
    await db.merchant.deleteMany({ where: { id: merchant.id } });
    await db.category.deleteMany({ where: { id: category.id } });
    await db.media.deleteMany({ where: { uploadedById: boss.id } });
    await db.auditEvent.deleteMany({ where: { actorId: boss.id } });
    await db.user.deleteMany({ where: { id: boss.id } });
    await db.memberStar.deleteMany({}); await db.forumProfile.deleteMany({ where: { customerId: { in: [a.id, b.id] } } });
    await db.customer.deleteMany({ where: { id: { in: [a.id, b.id] } } });
    await db.customerRateLimit.deleteMany({});
  }
});
