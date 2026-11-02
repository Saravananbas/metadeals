import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { getDatabase, disconnectDatabase } from "../src/server/db/client";
import { changeDealState, DealError, previewToken, saveDeal, saveTaxonomy, validPreview } from "../src/server/deals/service";
import { listPublicDeals } from "../src/server/deals/repository";
import { listingSchema } from "../src/features/deals/validation";
import { normalizeImage } from "../src/server/storage/media";
import { csvRows, parseDealImport, validateWorkbookZip } from "../src/server/deals/import";

async function main() {
const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (process.env.NODE_ENV === "production" || !["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "55432") throw new Error("Local development database only.");
const rollback = new Error("INTENTIONAL_TEST_ROLLBACK"); const db = getDatabase();
try {
  const image = await normalizeImage(await sharp({ create: { width: 20, height: 20, channels: 3, background: "white" } }).png().toBuffer());
  assert.equal(image.mimeType, "image/webp"); assert.equal(image.width, 20);
  await assert.rejects(normalizeImage(Buffer.from("<svg></svg>")), DealError);
  await assert.rejects(normalizeImage(Buffer.alloc(5 * 1024 * 1024 + 1)), DealError);
  assert.deepEqual(csvRows('a,b\n"hello,world","two"\n'), [["a", "b"], ["hello,world", "two"]]);
  assert.throws(() => validateWorkbookZip(Buffer.from("invalid")), DealError);
  await assert.rejects(parseDealImport(Buffer.from("bad\nvalue"), "csv"), DealError);
  const imported = await parseDealImport(await readFile("tests/fixtures/deals.xlsx"), "xlsx");
  assert.equal(imported.length, 1); assert.equal(imported[0].title, "Import test product"); assert.equal(imported[0].status, "DRAFT");
  const csv = "slug,title,description,categoryId,merchantId,mediaId,mrpMinor,priceMinor,productUrl\nimport-test,Import test product,Description,category,merchant,media,10000,9000,https://www.amazon.in/product";
  assert.equal((await parseDealImport(Buffer.from(csv), "csv"))[0].priceMinor, 9000);
  await db.$transaction(async (tx) => {
    const key = randomUUID();
    const admin = await tx.user.create({ data: { email: `m3-${key}@invalid.example`, status: "ACTIVE", role: "ADMIN", totpEnabledAt: new Date() } });
    const editor = await tx.user.create({ data: { email: `m3-editor-${key}@invalid.example`, status: "ACTIVE", role: "EDITOR", totpEnabledAt: new Date() } });
    const actor = { id: admin.id, role: admin.role }, editorActor = { id: editor.id, role: editor.role };
    const category = await saveTaxonomy(tx, actor, "categories", { name: "Test category", slug: `test-${key}` });
    const merchant = await saveTaxonomy(tx, actor, "merchants", { name: "Test merchant", slug: `test-${key}`, websiteUrl: "https://www.amazon.in/" });
    await assert.rejects(saveTaxonomy(tx, editorActor, "categories", { name: "Denied", slug: "denied" }), DealError);
    await assert.rejects(saveTaxonomy(tx, actor, "categories", { name: "Cycle", slug: category.slug, parentId: category.id }, category.id), DealError);
    const media = await tx.media.create({ data: { storageKey: `${key}.webp`, provider: "local", mimeType: image.mimeType, byteSize: image.bytes.length, width: image.width, height: image.height, alt: "Test image", uploadedById: admin.id } });
    const input = { slug: `test-${key}`, title: "Unique test phone", brand: key, description: "Test only", categoryId: category.id, merchantId: merchant.id, mediaId: media.id, mrpMinor: 10000, priceMinor: 8000, currency: "INR", rating: null, reviewCount: null, ratingSource: null, productUrl: "https://www.amazon.in/product", affiliateUrl: null, status: "DRAFT", publishedAt: null, startsAt: null, expiresAt: null, featured: true, trending: false, options: [] };
    let deal = await saveDeal(tx, editorActor, input);
    const query = listingSchema.parse({ q: key });
    assert.equal((await listPublicDeals(tx, query)).data.length, 0);
    await assert.rejects(changeDealState(tx, editorActor, deal.id, "publish", deal.version), DealError);
    const token = previewToken(editor.id, deal.id, deal.version);
    assert.equal(validPreview(token, editor.id, deal.id, deal.version + 1), false);
    assert.equal(validPreview(token, admin.id, deal.id, deal.version), false);
    assert.equal(validPreview(token, editor.id, deal.id, deal.version, Date.now() + 700000), false);
    deal = (await changeDealState(tx, editorActor, deal.id, "publish", deal.version, token))!;
    const listed = await listPublicDeals(tx, query); assert.equal(listed.data.length, 1); assert.equal(listed.data[0].discountPercent, 20);
    const second = await saveDeal(tx, actor, { ...input, slug: `second-${key}` });
    await changeDealState(tx, actor, second.id, "publish", second.version, previewToken(actor.id, second.id, second.version));
    const firstPage = await listPublicDeals(tx, listingSchema.parse({ q: key, limit: 1 }));
    assert.ok(firstPage.nextCursor);
    const secondPage = await listPublicDeals(tx, listingSchema.parse({ q: key, limit: 1, cursor: firstPage.nextCursor }));
    assert.equal(secondPage.data.length, 1); assert.notEqual(firstPage.data[0].id, secondPage.data[0].id);
    const secondUpdated = await tx.deal.findUniqueOrThrow({ where: { id: second.id } });
    await changeDealState(tx, actor, second.id, "archive", secondUpdated.version);
    assert.equal("createdById" in listed.data[0], false);
    await assert.rejects(changeDealState(tx, editorActor, deal.id, "archive", deal.version), DealError);
    await assert.rejects(changeDealState(tx, actor, deal.id, "delete", deal.version), DealError);
    await assert.rejects(saveDeal(tx, actor, input, deal.id, deal.version - 1), DealError);
    deal = await saveDeal(tx, actor, { ...input, startsAt: "2099-01-01T00:00:00Z", expiresAt: "2099-02-01T00:00:00Z" }, deal.id, deal.version);
    deal = (await changeDealState(tx, actor, deal.id, "publish", deal.version, previewToken(actor.id, deal.id, deal.version)))!;
    assert.equal((await listPublicDeals(tx, query)).data.length, 0);
    assert.equal((await listPublicDeals(tx, query, new Date("2099-01-02"))).data.length, 1);
    assert.equal((await listPublicDeals(tx, query, new Date("2099-02-01"))).data.length, 0);
    await changeDealState(tx, actor, deal.id, "archive", deal.version);
    assert.equal((await listPublicDeals(tx, query, new Date("2099-01-02"))).data.length, 0);
    const draft = await saveDeal(tx, actor, { ...input, slug: `draft-${key}` });
    await changeDealState(tx, actor, draft.id, "delete", draft.version);
    assert.equal(await tx.deal.findUnique({ where: { id: draft.id } }), null);
    assert.ok(await tx.auditEvent.count({ where: { actorId: actor.id } }));
    throw rollback;
  }, { timeout: 30000 }).catch((error) => { if (error !== rollback) throw error; });
  console.log("PASS M3 rollback-only integration: CRUD, role restrictions, preview binding, concurrency, public DTO, scheduling, expiry, archive, safe deletion, audit, image and import validation.");
} finally { await disconnectDatabase(); }

}
main().catch((error) => { console.error(error); process.exitCode = 1; });
