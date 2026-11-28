import assert from "node:assert/strict";
import test from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalPath, collapseRepeats, dealHref, primaryCategorySlug, productSlug, publicIdFromSlugPart, slugWords } from "../src/features/deals/seo-url";

// Database part: SEO_TEST_DB=1 and DATABASE_URL pointing at a disposable database whose name contains 'test'.
const databaseUrl = process.env.DATABASE_URL ?? "";
const safe = /\/[^/?]*test[^/?]*(\?|$)/i.test(databaseUrl);
const skip = process.env.SEO_TEST_DB === "1" && safe ? false : "set SEO_TEST_DB=1 and point DATABASE_URL at a disposable database whose name contains 'test'";
process.env.NEXTAUTH_SECRET ??= "test-nextauth-secret-0123456789abcdef0123";
process.env.NEXTAUTH_URL ??= "http://localhost:4123";
process.env.AUTH_SESSION_SECRET ??= "test-session-secret-0123456789abcdef0123";
process.env.AUTH_TOTP_ENCRYPTION_KEY ??= "dGVzdC10b3RwLWtleS1mb3ItYW5hbHl0aWNzLXRlc3Q=";
process.env.AUTH_BOOTSTRAP_EMAIL ??= "test@example.com";
process.env.MEDIA_DIR = join(tmpdir(), "metadeals-test-media");

test("product slugs: spec example, duplicate brands, symbols, unicode, empty, long titles", () => {
  assert.equal(productSlug("Pigeon Pigeon Popular Cooktop Glass Manual Gas Stove", "Pigeon"), "pigeon-popular-cooktop-glass-manual-gas-stove");
  assert.equal(productSlug("Blue Heaven Blue Heaven Makeup Mania Makeupkit for Women", "Blue Heaven"), "blue-heaven-makeup-mania-makeupkit-for-women");
  assert.equal(productSlug("Samsung Galaxy M35 5G (6GB/128GB) – Moonlight Blue!", "Samsung"), "samsung-galaxy-m35-5g-6gb-128gb-moonlight-blue");
  assert.equal(productSlug("Tom & Jerry   Kids' Set  50% OFF", "Tom"), "tom-and-jerry-kids-set-50-percent-off");
  assert.equal(productSlug("Café Ünïcode Résumé", ""), "cafe-unicode-resume");
  assert.equal(productSlug("घर का सामान", ""), "deal", "a title with no latin letters never gives an empty address part");
  assert.equal(productSlug("   !!!   ", null), "deal");
  assert.equal(productSlug("Sony WH-1000XM5 Headphones", "Sony"), "sony-wh-1000xm5-headphones", "model names stay intact");
  assert.equal(productSlug("Realme Narzo 70 Pro", "Realme"), "realme-narzo-70-pro", "the brand is not repeated when the title has it");
  assert.equal(productSlug("Redmi Note 13", "Xiaomi"), "xiaomi-redmi-note-13", "the brand is added when the title lacks it");
  assert.equal(productSlug("Pigeon Gas Stove", "Brand"), "pigeon-gas-stove", "a placeholder brand is ignored");
  const long = productSlug(Array.from({ length: 40 }, (_, i) => `word${i}`).join(" "), null);
  assert.ok(long.length <= 90, `long title cut at a word boundary (${long.length})`);
  assert.ok(!long.endsWith("-") && /word\d+$/.test(long));
  assert.deepEqual(collapseRepeats(slugWords("a b a b c")), ["a", "b", "c"]);
  assert.deepEqual(collapseRepeats(slugWords("go go go")), ["go"]);
  assert.deepEqual(collapseRepeats(slugWords("a b c a b")), ["a", "b", "c", "a", "b"], "only immediate repeats are removed");
});

test("canonical path: primary category only, id at the end, no path without a category", () => {
  const cats = new Map([["c1", { id: "c1", slug: "mobiles", parentId: null }], ["c2", { id: "c2", slug: "android-phones", parentId: "c1" }], ["c3", { id: "c3", slug: "Home & Kitchen", parentId: null }]]);
  assert.equal(primaryCategorySlug(cats, "c2"), "mobiles", "a sub-category deal uses its primary (top-level) category");
  assert.equal(primaryCategorySlug(cats, "c3"), "home-and-kitchen");
  assert.equal(primaryCategorySlug(cats, "missing"), null);
  assert.equal(canonicalPath({ categorySlug: "mobiles", title: "Samsung Galaxy M35 5G 128GB", brand: "Samsung", publicId: "d12ab34cd" }), "/deal/mobiles/samsung-galaxy-m35-5g-128gb-d12ab34cd");
  assert.equal(canonicalPath({ categorySlug: null, title: "x", publicId: "d12ab34cd" }), null);
  assert.equal(canonicalPath({ categorySlug: "mobiles", title: "x", publicId: "bad" }), null);
});

test("public id is read from the end of the address part only", () => {
  assert.equal(publicIdFromSlugPart("samsung-galaxy-d12ab34cd"), "d12ab34cd");
  assert.equal(publicIdFromSlugPart("SAMSUNG-GALAXY-D12AB34CD"), "d12ab34cd");
  assert.equal(publicIdFromSlugPart("d12ab34cd"), "d12ab34cd");
  assert.equal(publicIdFromSlugPart("samsung-d12ab34cd-extra"), null);
  assert.equal(publicIdFromSlugPart("deal-mwz7mku5"), null, "an old random-id address is not mistaken for a public id");
  assert.equal(publicIdFromSlugPart("amazon-product-b098q4t81t-b098q4t81t"), null);
  assert.equal(dealHref({ id: "x", slug: "old", path: "/deal/a/b-d12ab34cd" }), "/deal/a/b-d12ab34cd");
  assert.equal(dealHref({ id: "x", slug: "old" }), "/deal/old");
});

test("addresses, redirects, history, concurrency and 410 against a disposable database", { skip }, async () => {
  const { getDatabase } = await import("../src/server/db/client");
  const svc = await import("../src/server/deals/seo-url-service");
  const { publicWhere } = await import("../src/server/deals/repository");
  const { listingSchema } = await import("../src/features/deals/validation");
  const db = getDatabase();
  const live = publicWhere(listingSchema.parse({}));
  const stamp = Date.now().toString(36);
  const boss = await db.user.create({ data: { email: `zzseo-${stamp}@example.test`, role: "SUPER_ADMIN", status: "ACTIVE", name: "Fixture", totpEnabledAt: new Date() } });
  const catA = await db.category.create({ data: { slug: `zzseo-${stamp}-electronics`, name: "Electronics" } });
  const catB = await db.category.create({ data: { slug: `zzseo-${stamp}-audio`, name: "Audio" } });
  const catC = await db.category.create({ data: { slug: `zzseo-${stamp}-gadgets`, name: "Gadgets" } });
  const merchantAmazon = await db.merchant.create({ data: { slug: `zzseo-${stamp}-amazon`, name: "Amazon", websiteUrl: "https://amazon.in" } });
  const merchantFlip = await db.merchant.create({ data: { slug: `zzseo-${stamp}-flipkart`, name: "Flipkart", websiteUrl: "https://flipkart.com" } });
  const media = await db.media.create({ data: { storageKey: `${stamp}.webp`, provider: "local", mimeType: "image/webp", byteSize: 1, width: 1, height: 1, alt: "Fixture", uploadedById: boss.id } });
  const make = (slug: string, title: string, categoryId: string, merchantId: string, status: "PUBLISHED" | "DRAFT" = "PUBLISHED") => db.deal.create({ data: { slug, title, brand: "Sony", description: "Fixture", categoryId, merchantId, mediaId: media.id, mrpMinor: 20000, priceMinor: 10000, productUrl: "https://amazon.in/dp/B000000000", status, publishedAt: status === "PUBLISHED" ? new Date(Date.now() - 1000) : null, everPublished: status === "PUBLISHED", createdById: boss.id, updatedById: boss.id } });
  const ids: string[] = [];
  const base = `/deal/zzseo-${stamp}`;
  try {
    const amazon = await make(`zzseo-${stamp}-legacy-amazon`, "Sony Wireless Headphones", catA.id, merchantAmazon.id);
    const flipkart = await make(`zzseo-${stamp}-legacy-flipkart`, "Sony Wireless Headphones", catA.id, merchantFlip.id);
    const draft = await make(`zzseo-${stamp}-draft`, "Sony Draft Headphones", catA.id, merchantAmazon.id, "DRAFT");
    ids.push(amazon.id, flipkart.id, draft.id);

    // Assigning: id generated once, address built, idempotent, two offers for one product are two separate deals.
    const first = await svc.assignCanonicalPath(db, amazon.id);
    const again = await svc.assignCanonicalPath(db, amazon.id);
    const other = await svc.assignCanonicalPath(db, flipkart.id);
    assert.equal(first.changed, true); assert.equal(again.changed, false); assert.equal(again.path, first.path);
    assert.match(first.path!, new RegExp(`^/deal/zzseo-${stamp}-electronics/sony-wireless-headphones-d[0-9a-z]{8}$`));
    assert.notEqual(other.publicId, first.publicId); assert.notEqual(other.path, first.path, "same title and category, different deals, different addresses");
    const pidA = first.publicId!;

    // Legacy single-part address: 301 straight to the canonical address, by the deal's own record (never by words).
    const legacy = await svc.resolveDealAddress(db, [amazon.slug], live);
    assert.deepEqual(legacy, { kind: "redirect", to: first.path, status: 301 });
    assert.deepEqual(await svc.resolveDealAddress(db, [amazon.id], live), { kind: "redirect", to: first.path, status: 301 }, "the database id form also redirects");
    const parts = first.path!.split("/").slice(2);
    assert.equal((await svc.resolveDealAddress(db, parts, live)).kind, "render");
    // Unknown and look-alike addresses are never sent to some other deal.
    assert.equal((await svc.resolveDealAddress(db, ["no-such-deal"], live)).kind, "notfound");
    assert.equal((await svc.resolveDealAddress(db, ["electronics", "sony-wireless-headphones-dzzzzzzzz"], live)).kind, "notfound");
    assert.equal((await svc.resolveDealAddress(db, [parts[0], "sony-wireless-headphones"], live)).kind, "notfound", "words alone identify nothing");
    assert.equal((await svc.resolveDealAddress(db, ["a", "b", "c"], live)).kind, "notfound");
    // Right id, wrong category or words: one permanent redirect to the current address.
    assert.deepEqual(await svc.resolveDealAddress(db, ["audio", `old-words-${pidA}`], live), { kind: "redirect", to: first.path, status: 308 });
    // A draft is not public: not found, no leak.
    await svc.assignCanonicalPath(db, draft.id);
    const draftPath = (await db.deal.findUniqueOrThrow({ where: { id: draft.id } })).canonicalPath!;
    assert.equal((await svc.resolveDealAddress(db, draftPath.split("/").slice(2), live)).kind, "notfound");

    // Category change: new address, same deal and id, old address kept and redirected directly (no chain).
    await db.deal.update({ where: { id: amazon.id }, data: { categoryId: catB.id } });
    const moved = await svc.assignCanonicalPath(db, amazon.id);
    assert.equal(moved.changed, true); assert.equal(moved.publicId, pidA, "the id never changes");
    assert.match(moved.path!, new RegExp(`^/deal/zzseo-${stamp}-audio/`));
    const oldAddress = await db.dealUrlHistory.findUniqueOrThrow({ where: { path: first.path! } });
    assert.equal(oldAddress.dealId, amazon.id); assert.equal(oldAddress.reason, "category"); assert.equal(oldAddress.redirectStatus, 301);
    assert.deepEqual(await svc.resolveDealAddress(db, first.path!.split("/").slice(2), live), { kind: "redirect", to: moved.path, status: 308 });
    // Several changes in a row: every old address points straight at the newest.
    await db.deal.update({ where: { id: amazon.id }, data: { categoryId: catC.id, title: "Sony Wireless Headphones WH-1000XM5" } });
    const third = await svc.assignCanonicalPath(db, amazon.id);
    for (const old of [first.path!, moved.path!]) {
      const hop = await svc.resolveDealAddress(db, old.split("/").slice(2), live);
      assert.deepEqual(hop, { kind: "redirect", to: third.path, status: 308 }, "no chain: the target is the current address");
    }
    assert.match(third.path!, /sony-wireless-headphones-wh-1000xm5-d/);
    // Back to the first category and title: no loop; the old address is the canonical one again and the middle one redirects to it.
    await db.deal.update({ where: { id: amazon.id }, data: { categoryId: catA.id, title: "Sony Wireless Headphones" } });
    const back = await svc.assignCanonicalPath(db, amazon.id);
    assert.equal(back.path, first.path);
    assert.equal((await svc.resolveDealAddress(db, first.path!.split("/").slice(2), live)).kind, "render");
    assert.deepEqual(await svc.resolveDealAddress(db, third.path!.split("/").slice(2), live), { kind: "redirect", to: first.path, status: 308 });
    // The original /deal/{slug} address still lands on the current one.
    await svc.rememberLegacyPath(db, amazon.id, amazon.slug); await svc.rememberLegacyPath(db, amazon.id, amazon.slug);
    assert.equal(await db.dealUrlHistory.count({ where: { path: `/deal/${amazon.slug}` } }), 1, "remembering twice keeps one row");
    assert.deepEqual(await svc.resolveDealAddress(db, [amazon.slug], live), { kind: "redirect", to: first.path, status: 301 });
    // Every address belongs to exactly one deal.
    const all = await db.deal.findMany({ where: { id: { in: ids } }, select: { canonicalPath: true } });
    assert.equal(new Set(all.map((d) => d.canonicalPath)).size, all.length);

    // Concurrent saves after a category change leave one consistent canonical address.
    await db.deal.update({ where: { id: flipkart.id }, data: { categoryId: catB.id } });
    const results = await Promise.all(Array.from({ length: 6 }, () => svc.assignCanonicalPath(db, flipkart.id)));
    const final = (await db.deal.findUniqueOrThrow({ where: { id: flipkart.id } })).canonicalPath;
    assert.ok(results.every((r) => r.path === final));
    assert.equal(await db.dealUrlHistory.count({ where: { dealId: flipkart.id, path: other.path! } }), 1);

    // A deal with a missing category is not given a misleading address.
    const orphan = await svc.assignCanonicalPath(db, "no-such-deal-id");
    assert.equal(orphan.skipped, "no-deal");

    // Deleted deal: its addresses answer 410 Gone, unknown ones 404.
    const gone = await db.deal.findUniqueOrThrow({ where: { id: flipkart.id } });
    await svc.rememberDeletedDeal(db, { id: gone.id, slug: gone.slug, canonicalPath: gone.canonicalPath });
    await db.deal.delete({ where: { id: flipkart.id } }); ids.splice(ids.indexOf(flipkart.id), 1);
    assert.deepEqual(await svc.resolveDealAddress(db, gone.canonicalPath!.split("/").slice(2), live), { kind: "gone" });
    assert.deepEqual(await svc.resolveDealAddress(db, [gone.slug], live), { kind: "gone" });
    assert.equal((await svc.resolveDealAddress(db, ["never-existed"], live)).kind, "notfound");
    void base;
  } finally {
    await db.dealUrlHistory.deleteMany({ where: { dealId: { in: [...ids] } } });
    await db.dealUrlHistory.deleteMany({ where: { path: { contains: `zzseo-${stamp}` } } });
    await db.deal.deleteMany({ where: { id: { in: ids } } });
    await db.media.delete({ where: { id: media.id } }).catch(() => {});
    await db.merchant.deleteMany({ where: { id: { in: [merchantAmazon.id, merchantFlip.id] } } });
    await db.category.deleteMany({ where: { id: { in: [catA.id, catB.id, catC.id] } } });
    await db.user.delete({ where: { id: boss.id } }).catch(() => {});
    await db.$disconnect();
  }
});
