import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

// Needs a disposable database: COMMUNITY_TEST_DB=1 with DATABASE_URL (and DATABASE_PROVIDER) pointing at a database that has the migrations applied.
// Test rows are prefixed "ZZTEST" and removed afterwards.
const enabled = process.env.COMMUNITY_TEST_DB === "1";
const skip = enabled ? false : "set COMMUNITY_TEST_DB=1 and point DATABASE_URL at a disposable migrated database";

process.env.MEDIA_DIR = mkdtempSync(join(tmpdir(), "md-submissions-"));
process.env.NEXTAUTH_SECRET ??= "test-nextauth-secret-0123456789abcdef0123";
process.env.NEXTAUTH_URL ??= "http://localhost:4123";
process.env.AUTH_SESSION_SECRET ??= "test-session-secret-0123456789abcdef0123";
process.env.AUTH_TOTP_ENCRYPTION_KEY ??= "dGVzdC10b3RwLWtleS1mb3ItYW5hbHl0aWNzLXRlc3Q=";
process.env.AUTH_BOOTSTRAP_EMAIL ??= "test@example.com";

const load = async () => {
  await import("dotenv/config");
  const sharp = (await import("sharp")).default;
  return {
    sharp,
    ...(await import("../src/server/db/client")),
    ...(await import("../src/server/customer/submissions")),
    ...(await import("../src/server/customer/profile")),
    ...(await import("../src/server/community/review")),
    ...(await import("../src/server/deals/service")),
    ...(await import("../src/server/deals/repository")),
    ...(await import("../src/features/deals/validation")),
    ...(await import("../src/server/affiliate/service")),
  };
};

async function fixtures() {
  const m = await load();
  const db = m.getDatabase();
  const admin = await db.user.findFirst({ where: { status: "ACTIVE", totpEnabledAt: { not: null }, role: { in: ["SUPER_ADMIN", "ADMIN"] } } });
  const category = await db.category.findFirst(), merchant = await db.merchant.findFirst();
  assert.ok(admin && category && merchant, "the test database needs an active admin with 2FA, a category and a merchant");
  const png = await m.sharp({ create: { width: 24, height: 24, channels: 3, background: "#4455aa" } }).png().toBuffer();
  const stamp = Date.now().toString(36);
  const customer = (label: string, extra: Record<string, unknown> = {}) =>
    db.customer.create({ data: { name: `ZZTEST ${label}`, email: `zztest-${label}-${stamp}@example.com`, emailVerifiedAt: new Date(), ...extra } });
  const fields = (n: string, extra: Record<string, unknown> = {}) => ({
    title: `ZZTEST deal ${n} ${stamp}`, description: "A real deal I checked on the store page today.", productUrl: `https://www.example-store.in/p/${n}-${stamp}`,
    priceMinor: 49900, mrpMinor: 99900, ...extra,
  });
  const actor = { id: admin.id, role: admin.role as "SUPER_ADMIN" | "ADMIN" };
  const approveInput = (s: { version: number; title: string; description: string; productUrl: string }) => ({
    version: s.version, categoryId: category.id, merchantId: merchant.id, title: s.title, brand: "", description: s.description, productUrl: s.productUrl, priceMinor: 49900, mrpMinor: 99900,
  });
  return { m, db, actor, png, customer, fields, approveInput, stamp };
}

async function cleanup(m: Awaited<ReturnType<typeof load>>) {
  const db = m.getDatabase();
  const subs = await db.communityDealSubmission.findMany({ where: { customer: { name: { startsWith: "ZZTEST" } } }, select: { id: true, dealId: true, imageKey: true } });
  const dealIds = subs.map((s) => s.dealId).filter((x): x is string => Boolean(x));
  await db.communityDealSubmission.deleteMany({ where: { id: { in: subs.map((s) => s.id) } } });
  if (dealIds.length) await db.deal.deleteMany({ where: { id: { in: dealIds } } });
  await db.media.deleteMany({ where: { storageKey: { in: subs.map((s) => s.imageKey) } } });
  await db.customer.deleteMany({ where: { name: { startsWith: "ZZTEST" } } });
  await db.customerRateLimit.deleteMany({});
  await m.disconnectDatabase();
}

const status = (promise: Promise<unknown>) => promise.then(() => 0, (e: { status?: number }) => e.status ?? -1);

test("submitting requires an active, verified customer and valid data", { skip }, async () => {
  const f = await fixtures();
  try {
    const unverified = await f.customer("unverified", { emailVerifiedAt: null }), disabled = await f.customer("disabled", { disabledAt: new Date() }), ok = await f.customer("ok");
    assert.equal(await status(f.m.createSubmission(unverified.id, f.fields("a"), f.png)), 403);
    assert.equal(await status(f.m.createSubmission(disabled.id, f.fields("a"), f.png)), 403);
    assert.equal(await status(f.m.createSubmission("no-such-customer", f.fields("a"), f.png)), 403);
    assert.equal(await status(f.m.createSubmission(ok.id, f.fields("b"), null)), 400, "an image is required");
    assert.equal(await status(f.m.createSubmission(ok.id, f.fields("b"), Buffer.from("not an image"))), 400, "the image must be a real image");
    for (const bad of [{ productUrl: "http://insecure.example.in/x" }, { productUrl: "https://localhost/x" }, { productUrl: "javascript:alert(1)" }, { priceMinor: 5 }, { priceMinor: 200000, mrpMinor: 100000 }, { title: "ab" }, { customerId: "someone-else" }]) {
      await assert.rejects(f.m.createSubmission(ok.id, f.fields("c", bad), f.png), (e: unknown) => (e as Error).name === "ZodError" || (e as { status?: number }).status === 400);
    }
    const good = await f.m.createSubmission(ok.id, f.fields("d"), f.png);
    assert.equal(good.stage, "PENDING_REVIEW");
    assert.equal((await f.db.communityDealSubmission.findUniqueOrThrow({ where: { id: good.id } })).customerId, ok.id, "the owner is the session customer");
  } finally { await cleanup(f.m); }
});

test("duplicates are refused and each customer only sees their own submissions and profile", { skip }, async () => {
  const f = await fixtures();
  try {
    const a = await f.customer("a"), b = await f.customer("b");
    const first = await f.m.createSubmission(a.id, f.fields("dup"), f.png);
    assert.equal(await status(f.m.createSubmission(a.id, f.fields("dup"), f.png)), 409);
    assert.equal(await status(f.m.createSubmission(a.id, f.fields("dup", { productUrl: f.fields("dup").productUrl + "?utm_source=x&tag=abc#top" }), f.png)), 409, "tracking parameters do not make a new link");

    assert.equal(await status(f.m.getOwnSubmission(b.id, first.id)), 404);
    assert.equal(await status(f.m.getOwnSubmissionImage(b.id, first.id)), 404);
    assert.equal(await status(f.m.resubmit(b.id, first.id, f.fields("dup"), 1, null)), 404);
    assert.deepEqual((await f.m.listOwnSubmissions(b.id)).length, 0);
    assert.equal((await f.m.getSubmissionCounts(b.id)).total, 0);

    await f.m.updateProfile(a.id, { name: "ZZTEST Alice", sex: "FEMALE", dateOfBirth: "1990-05-17", location: "Chennai" });
    const mine = await f.m.getProfile(a.id), theirs = await f.m.getProfile(b.id);
    assert.deepEqual([mine.name, mine.sex, mine.dateOfBirth, mine.location], ["ZZTEST Alice", "FEMALE", "1990-05-17", "Chennai"]);
    assert.deepEqual([theirs.sex, theirs.dateOfBirth, theirs.location], [null, null, null]);
    for (const bad of [{ name: "x" }, { name: "ZZTEST ok", dateOfBirth: "2999-01-01" }, { name: "ZZTEST ok", dateOfBirth: "1990-02-31" }, { name: "ZZTEST ok", sex: "robot" }, { name: "ZZTEST ok", id: "other" }]) {
      await assert.rejects(f.m.updateProfile(a.id, bad), (e: Error) => e.name === "ZodError");
    }
    const cleared = await f.m.updateProfile(a.id, { name: "ZZTEST Alice", sex: "PREFER_NOT_TO_SAY", dateOfBirth: "", location: "" });
    assert.deepEqual([cleared.sex, cleared.dateOfBirth, cleared.location], ["PREFER_NOT_TO_SAY", null, null], "optional fields can be cleared");
  } finally { await cleanup(f.m); }
});

test("review states: only pending can be decided, versions guard concurrency, rejected posts can be resubmitted", { skip }, async () => {
  const f = await fixtures();
  try {
    const a = await f.customer("states");
    const s = await f.m.createSubmission(a.id, f.fields("s1"), f.png);
    const nobody = { id: f.actor.id, role: "VIEWER" as never };
    assert.equal(await status(f.m.rejectSubmission(nobody, s.id, { version: s.version, reason: "Not valid at all" })), 403, "roles without the publish permission cannot review");
    assert.equal(await status(f.m.approveSubmission(nobody, s.id, f.approveInput(s))), 403);
    assert.equal(await status(f.m.listSubmissions(nobody, "PENDING_REVIEW")), 403);

    await assert.rejects(f.m.rejectSubmission(f.actor, s.id, { version: s.version, reason: "no" }), (e: Error) => e.name === "ZodError", "a reason is required");
    assert.equal(await status(f.m.rejectSubmission(f.actor, s.id, { version: 99, reason: "Wrong version here" })), 409);
    await f.m.rejectSubmission(f.actor, s.id, { version: s.version, reason: "The price on the store page is different" });
    assert.equal(await status(f.m.rejectSubmission(f.actor, s.id, { version: s.version + 1, reason: "Second time over" })), 409, "already decided");
    assert.equal(await status(f.m.approveSubmission(f.actor, s.id, f.approveInput({ ...s, version: s.version + 1 }))), 409, "a rejected post cannot be approved without resubmission");

    const rejected = await f.m.getOwnSubmission(a.id, s.id);
    assert.equal(rejected.stage, "REJECTED");
    assert.equal(rejected.rejectionReason, "The price on the store page is different");
    assert.equal(await status(f.m.resubmit(a.id, s.id, f.fields("s1"), rejected.version - 1, null)), 409, "stale version");
    const again = await f.m.resubmit(a.id, s.id, f.fields("s1", { priceMinor: 45900 }), rejected.version, null);
    assert.equal(again.stage, "PENDING_REVIEW");
    assert.equal(again.rejectionReason, null);
    assert.equal(again.priceMinor, 45900);
    assert.equal(await status(f.m.resubmit(a.id, s.id, f.fields("s1"), again.version, null)), 409, "a pending post cannot be edited through resubmit");

    const audits = await f.db.auditEvent.count({ where: { targetId: s.id, action: { in: ["submission.rejected", "submission.approved"] } } });
    assert.equal(audits, 1, "decisions are written to the audit log");
  } finally { await cleanup(f.m); }
});

test("approved submissions stay private until published, and counts follow the real state", { skip }, async () => {
  const f = await fixtures();
  try {
    const a = await f.customer("flow");
    const [pending, rejected, toLive, awaiting] = [
      await f.m.createSubmission(a.id, f.fields("p"), f.png), await f.m.createSubmission(a.id, f.fields("r"), f.png),
      await f.m.createSubmission(a.id, f.fields("l"), f.png), await f.m.createSubmission(a.id, f.fields("w"), f.png),
    ];
    let counts = await f.m.getSubmissionCounts(a.id);
    assert.deepEqual(counts, { total: 4, pendingReview: 4, approvedAwaitingPublication: 0, rejected: 0, live: 0 });

    await f.m.rejectSubmission(f.actor, rejected.id, { version: rejected.version, reason: "Link does not show this product" });
    const live = await f.m.approveSubmission(f.actor, toLive.id, f.approveInput(toLive));
    await f.m.approveSubmission(f.actor, awaiting.id, f.approveInput(awaiting));
    assert.equal(await status(f.m.approveSubmission(f.actor, toLive.id, f.approveInput({ ...toLive, version: toLive.version + 1 }))), 409, "double approval is refused");

    counts = await f.m.getSubmissionCounts(a.id);
    assert.deepEqual(counts, { total: 4, pendingReview: 1, approvedAwaitingPublication: 2, rejected: 1, live: 0 });

    // Approved = an ordinary DRAFT deal created by the admin. It is not public and cannot be redirected to.
    const draft = await f.db.deal.findUniqueOrThrow({ where: { id: live.dealId } });
    assert.equal(draft.status, "DRAFT");
    assert.equal(draft.createdById, f.actor.id, "the deal belongs to the admin user, not the customer");
    const publicBefore = await f.db.deal.findMany({ where: { ...f.m.publicWhere(f.m.listingSchema.parse({})), id: live.dealId } });
    assert.equal(publicBefore.length, 0, "not in the public catalogue before publication");
    assert.ok([404, 410].includes(await status(f.m.resolveDealRedirect(f.db, live.dealId, null, { ip: "1.1.1.1", userAgent: "Mozilla/5.0", channel: "web" }))), "no affiliate redirect before publication");
    assert.equal((await f.m.getOwnSubmission(a.id, toLive.id)).dealSlug, null);
    assert.equal((await f.m.getOwnSubmission(a.id, toLive.id)).stage, "APPROVED");

    // Publication still goes through the existing preview + publish gate.
    assert.equal(await status(f.db.$transaction((tx) => f.m.changeDealState(tx, f.actor, draft.id, "publish", draft.version))), 409, "publishing needs the preview token");
    const token = f.m.previewToken(f.actor.id, draft.id, draft.version);
    await f.db.$transaction((tx) => f.m.changeDealState(tx, f.actor, draft.id, "publish", draft.version, token));
    const published = await f.db.deal.findUniqueOrThrow({ where: { id: draft.id } });
    assert.equal(published.status, "PUBLISHED");
    assert.equal((await f.db.deal.findMany({ where: { ...f.m.publicWhere(f.m.listingSchema.parse({})), id: draft.id } })).length, 1, "public once published");

    counts = await f.m.getSubmissionCounts(a.id);
    assert.deepEqual(counts, { total: 4, pendingReview: 1, approvedAwaitingPublication: 1, rejected: 1, live: 1 });
    const mine = await f.m.getOwnSubmission(a.id, toLive.id);
    assert.equal(mine.stage, "LIVE");
    assert.equal(mine.dealSlug, published.slug);
    assert.ok(pending.id);

    // Another customer's counts are unaffected.
    const b = await f.customer("other");
    assert.deepEqual(await f.m.getSubmissionCounts(b.id), { total: 0, pendingReview: 0, approvedAwaitingPublication: 0, rejected: 0, live: 0 });
  } finally { await cleanup(f.m); }
});

test("customer routes need a signed-in session and a same-origin request", { skip }, async () => {
  await import("dotenv/config");
  const profile = await import("../src/app/api/v1/customer/profile/route");
  const submissions = await import("../src/app/api/v1/customer/submissions/route");
  const origin = "http://localhost:4123";
  assert.equal((await profile.GET(new Request(`${origin}/api/v1/customer/profile`))).status, 401);
  assert.equal((await submissions.GET(new Request(`${origin}/api/v1/customer/submissions`))).status, 401);
  assert.equal((await submissions.POST(new Request(`${origin}/api/v1/customer/submissions`, { method: "POST", headers: { origin: "https://evil.example" }, body: new FormData() }))).status, 403, "cross-site requests are refused before anything else");
  assert.equal((await profile.PATCH(new Request(`${origin}/api/v1/customer/profile`, { method: "PATCH", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ name: "ZZTEST x" }) }))).status, 401);
  const { disconnectDatabase } = await import("../src/server/db/client");
  await disconnectDatabase();
});
