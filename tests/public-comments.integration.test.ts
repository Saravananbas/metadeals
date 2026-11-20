import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";
import { getDatabase } from "../src/server/db/client";
import { GET, OPTIONS, POST } from "../src/app/api/v1/deals/[slug]/comments/route";

const databaseUrl = process.env.DATABASE_URL ?? "";
const disposableDatabase = process.env.NODE_ENV === "test" &&
  databaseUrl.includes("metadeals_test") &&
  databaseUrl.startsWith("postgresql://metadeals_test:");

test("comments need a signed-in member, guests cannot post, and the public list still shows older guest comments", {
  skip: disposableDatabase ? false : "requires the disposable Docker PostgreSQL/Redis test profile",
}, async () => {
  const db = getDatabase();
  const suffix = randomUUID().replaceAll("-", "").slice(0, 18);
  const rateLimitSubject = `disposable-test-${suffix}`;
  let userId: string | undefined;
  let categoryId: string | undefined;
  let merchantId: string | undefined;
  let mediaId: string | undefined;
  let dealId: string | undefined;

  try {
    const user = await db.user.create({
      data: { name: "Comments integration fixture", email: `comments-${suffix}@example.invalid`, role: "ADMIN", status: "ACTIVE" },
      select: { id: true },
    });
    userId = user.id;
    const category = await db.category.create({ data: { slug: `comments-${suffix}`, name: "Comments fixture" }, select: { id: true } });
    categoryId = category.id;
    const merchant = await db.merchant.create({
      data: { slug: `comments-${suffix}`, name: "Comments fixture", websiteUrl: "https://amazon.in" },
      select: { id: true },
    });
    merchantId = merchant.id;
    const media = await db.media.create({
      data: {
        storageKey: `${randomUUID()}.webp`, provider: "local", mimeType: "image/webp", byteSize: 1,
        width: 1, height: 1, alt: "Fixture", uploadedById: user.id,
      },
      select: { id: true },
    });
    mediaId = media.id;
    const deal = await db.deal.create({
      data: {
        slug: `comments-${suffix}`, title: "Public comments fixture", brand: "Fixture", description: "Integration test fixture",
        categoryId: category.id, merchantId: merchant.id, mediaId: media.id, mrpMinor: 1000, priceMinor: 500,
        productUrl: "https://amazon.in/dp/B000000000", status: "PUBLISHED", publishedAt: new Date(Date.now() - 1000),
        createdById: user.id, updatedById: user.id,
      },
      select: { id: true, slug: true },
    });
    dealId = deal.id;

    const preflight = await OPTIONS();
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), "*");

    // Only signed-in members can comment: a guest is refused, with or without a picture.
    const refused = await POST(new Request("http://localhost/api/comments", {
      method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": rateLimitSubject },
      body: JSON.stringify({ authorName: "Guest", content: "A guest tries to comment" }),
    }), { params: Promise.resolve({ slug: deal.slug }) });
    assert.equal(refused.status, 401);

    // Older guest comments stay visible in the public list.
    for (let index = 1; index <= 3; index += 1) await db.dealComment.create({ data: { dealId: deal.id, authorName: "Guest", content: `Guest comment ${index}` } });
    const listing = await GET(new Request("http://localhost/api/comments"), { params: Promise.resolve({ slug: deal.slug }) });
    assert.equal(listing.status, 200);
    const result = await listing.json() as { ok: boolean; data: { comments: Array<{ content: string; member: unknown }>; count: number } };
    assert.equal(result.ok, true);
    assert.equal(result.data.count, 3);
    assert.ok(result.data.comments.every((comment) => comment.content.startsWith("Guest comment ") && comment.member === null));
  } finally {
    if (dealId) await db.dealComment.deleteMany({ where: { dealId } });
    if (dealId) await db.deal.deleteMany({ where: { id: dealId } });
    if (mediaId) await db.media.deleteMany({ where: { id: mediaId } });
    if (merchantId) await db.merchant.deleteMany({ where: { id: merchantId } });
    if (categoryId) await db.category.deleteMany({ where: { id: categoryId } });
    if (userId) await db.user.deleteMany({ where: { id: userId } });
  }
});
