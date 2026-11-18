import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { classifyDeal, dealTabWhere, DEAL_TABS } from "../src/features/deals/tabs";

// Database part runs only on a DISPOSABLE migrated database (name contains "test"):
//   ROLES_TEST_DB=1 DATABASE_PROVIDER=mysql DATABASE_URL=... node --conditions=react-server --experimental-test-module-mocks --import tsx --test --test-force-exit tests/deal-tabs.test.ts
const databaseUrl = process.env.DATABASE_URL ?? "";
const safe = /\/[^/?]*test[^/?]*(\?|$)/i.test(databaseUrl);
const skip = process.env.ROLES_TEST_DB === "1" && safe && typeof (mock as { module?: unknown }).module === "function" ? false : "set ROLES_TEST_DB=1, a disposable DATABASE_URL (name contains 'test') and --experimental-test-module-mocks";
process.env.NEXTAUTH_SECRET ??= "test-nextauth-secret-0123456789abcdef0123";
process.env.NEXTAUTH_URL = "http://localhost:4123";
process.env.AUTH_SESSION_SECRET ??= "test-session-secret-0123456789abcdef0123";
process.env.AUTH_TOTP_ENCRYPTION_KEY ??= "dGVzdC10b3RwLWtleS1mb3ItYW5hbHl0aWNzLXRlc3Q=";
process.env.AUTH_BOOTSTRAP_EMAIL ??= "test@example.com";
delete process.env.AUTH_DISABLED_DEV;

test("classifyDeal: every deal is in exactly one tab, and an ended offer moves to Expired by itself", () => {
  const now = new Date("2026-11-20T10:00:00Z");
  const past = new Date("2026-11-20T09:00:00Z"), future = new Date("2026-11-21T09:00:00Z");
  assert.equal(classifyDeal({ status: "PUBLISHED", expiresAt: null }, now), "active");
  assert.equal(classifyDeal({ status: "PUBLISHED", expiresAt: future }, now), "active");
  assert.equal(classifyDeal({ status: "PUBLISHED", expiresAt: past }, now), "expired", "end date passed");
  assert.equal(classifyDeal({ status: "PUBLISHED", expiresAt: past.toISOString() }, now), "expired", "dates arrive as strings from the API");
  assert.equal(classifyDeal({ status: "EXPIRED", expiresAt: null }, now), "expired");
  assert.equal(classifyDeal({ status: "ARCHIVED", expiresAt: past }, now), "deleted", "deleted wins over expired");
  assert.equal(classifyDeal({ status: "DRAFT", expiresAt: past }, now), "active", "a draft is still being worked on");
  assert.equal(classifyDeal({ status: "PENDING_REVIEW", expiresAt: null }, now), "active");
  assert.deepEqual([...DEAL_TABS], ["active", "expired", "deleted"]);
});

test("dealTabWhere: the three filters match the three classes", () => {
  const now = new Date("2026-11-20T10:00:00Z");
  assert.deepEqual(dealTabWhere("deleted", now), { status: "ARCHIVED" });
  const expired = JSON.stringify(dealTabWhere("expired", now));
  assert.match(expired, /"status":"EXPIRED"/);
  assert.match(expired, /"status":"PUBLISHED"[^}]*"expiresAt":\{"lte"/);
  const active = JSON.stringify(dealTabWhere("active", now));
  assert.match(active, /DRAFT/);
  assert.match(active, /"expiresAt":null/);
  assert.match(active, /"expiresAt":\{"gt"/);
  assert.doesNotMatch(active, /ARCHIVED|"EXPIRED"/);
});

test("admin deals API: tab lists, counts, soft delete, restore and who may restore", { skip }, async () => {
  let currentToken: string | null = null;
  mock.module("next/headers", {
    namedExports: {
      cookies: async () => ({ get: (name: string) => (currentToken && name.includes("metadeals-session") ? { value: currentToken } : undefined), set: () => {} }),
      headers: async () => new Headers(),
    },
  });
  const { getDatabase } = await import("../src/server/db/client");
  const { createOpaqueToken, hashOpaqueToken, createTotpSecret, encryptTotpSecret } = await import("../src/server/auth/crypto");
  const route = await import("../src/app/api/v1/admin/[...path]/route");
  const db = getDatabase();
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const person = async (role: "SUPER_ADMIN" | "EDITOR") => {
    const user = await db.user.create({ data: { email: `tabs-test-${role.toLowerCase()}-${stamp}@example.test`, name: role, role, status: "ACTIVE", totpEnabledAt: new Date(), totpSecretEncrypted: encryptTotpSecret(createTotpSecret(), process.env.AUTH_TOTP_ENCRYPTION_KEY!), passwordHash: "x" } });
    const token = createOpaqueToken(32);
    await db.authSession.create({ data: { userId: user.id, tokenHash: hashOpaqueToken(token, process.env.AUTH_SESSION_SECRET!), expiresAt: new Date(Date.now() + 3_600_000), absoluteExpiresAt: new Date(Date.now() + 36_000_000) } });
    return { user, token };
  };
  const call = async (token: string, method: string, path: string[], query = "", body: unknown = {}) => {
    currentToken = token;
    const handler = (route as unknown as Record<string, (r: Request, c: { params: Promise<{ path: string[] }> }) => Promise<Response>>)[method];
    const response = await handler(new Request(`http://localhost:4123/api/v1/admin/${path.join("/")}${query}`, { method, headers: { origin: "http://localhost:4123", "content-type": "application/json" }, ...(method === "GET" ? {} : { body: JSON.stringify(body) }) }), { params: Promise.resolve({ path }) });
    return { status: response.status, body: await response.json().catch(() => null) as { data?: unknown; counts?: Record<string, number> } | null };
  };
  const slugs = (res: { body: { data?: unknown } | null }) => (res.body?.data as { slug: string }[]).map((d) => d.slug).filter((s) => s.startsWith(`tabs-${stamp}`)).sort();
  try {
    const boss = await person("SUPER_ADMIN"), editor = await person("EDITOR");
    const category = await db.category.create({ data: { slug: `tabs-${stamp}`, name: "Tabs fixture" } });
    const merchant = await db.merchant.create({ data: { slug: `tabs-${stamp}`, name: "Tabs fixture", websiteUrl: "https://amazon.in" } });
    const media = await db.media.create({ data: { storageKey: `${stamp}.webp`, provider: "local", mimeType: "image/webp", byteSize: 1, width: 1, height: 1, alt: "Fixture", uploadedById: boss.user.id } });
    const base = { categoryId: category.id, merchantId: merchant.id, mediaId: media.id, brand: "Fixture", description: "Tabs fixture", mrpMinor: 1000, priceMinor: 500, productUrl: "https://amazon.in/dp/B000000000", createdById: boss.user.id, updatedById: boss.user.id };
    const published = new Date(Date.now() - 86_400_000);
    const make = (name: string, data: Record<string, unknown>) => db.deal.create({ data: { ...base, slug: `tabs-${stamp}-${name}`, title: `Tabs ${name}`, publishedAt: published, everPublished: true, ...data } as never });
    const live = await make("live", { status: "PUBLISHED" });
    const ended = await make("ended", { status: "PUBLISHED", expiresAt: new Date(Date.now() - 3_600_000) });
    await make("flagged", { status: "EXPIRED" });
    await make("draft", { status: "DRAFT", everPublished: false });

    const active = await call(boss.token, "GET", ["deals"], "?tab=active");
    assert.deepEqual(slugs(active), [`tabs-${stamp}-draft`, `tabs-${stamp}-live`]);
    assert.deepEqual(slugs(await call(boss.token, "GET", ["deals"], "?tab=expired")), [`tabs-${stamp}-ended`, `tabs-${stamp}-flagged`], "an ended offer is in Expired without anyone touching it");
    assert.deepEqual(slugs(await call(boss.token, "GET", ["deals"], "?tab=deleted")), []);
    assert.ok((active.body?.counts?.active ?? 0) >= 2 && (active.body?.counts?.expired ?? 0) >= 2);
    assert.equal((await call(boss.token, "GET", ["deals"], "?tab=nonsense")).status >= 400, true, "unknown tab is refused");

    // Soft delete, then it shows in Deleted and nowhere else.
    const archived = await call(boss.token, "POST", ["deals", live.id, "archive"], "", { version: live.version });
    assert.equal(archived.status, 200);
    assert.deepEqual(slugs(await call(boss.token, "GET", ["deals"], "?tab=deleted")), [`tabs-${stamp}-live`]);
    assert.ok(!slugs(await call(boss.token, "GET", ["deals"], "?tab=active")).includes(`tabs-${stamp}-live`));
    const row = await db.deal.findUniqueOrThrow({ where: { id: live.id } });

    // An editor cannot restore; a super admin can, and the deal comes back as a draft.
    assert.equal((await call(editor.token, "POST", ["deals", live.id, "restore"], "", { version: row.version })).status, 403);
    assert.equal((await call(boss.token, "POST", ["deals", live.id, "restore"], "", { version: row.version })).status, 200);
    assert.equal((await db.deal.findUniqueOrThrow({ where: { id: live.id } })).status, "DRAFT");
    assert.equal((await call(boss.token, "POST", ["deals", ended.id, "restore"], "", { version: ended.version })).status, 409, "only a deleted deal can be restored");
  } finally {
    await db.auditEvent.deleteMany({ where: { action: { startsWith: "deal." }, actor: { email: { startsWith: "tabs-test-" } } } }).catch(() => undefined);
    await db.deal.deleteMany({ where: { slug: { startsWith: `tabs-${stamp}` } } });
    await db.media.deleteMany({ where: { storageKey: `${stamp}.webp` } });
    await db.merchant.deleteMany({ where: { slug: `tabs-${stamp}` } });
    await db.category.deleteMany({ where: { slug: `tabs-${stamp}` } });
    await db.authSession.deleteMany({ where: { user: { email: { startsWith: "tabs-test-" } } } });
    await db.user.deleteMany({ where: { email: { startsWith: "tabs-test-" } } });
  }
});
