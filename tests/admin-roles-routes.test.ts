import assert from "node:assert/strict";
import test, { mock } from "node:test";

// Real sessions against the real admin route handler, on a DISPOSABLE migrated database (name contains "test"):
//   ROLES_TEST_DB=1 DATABASE_PROVIDER=mysql DATABASE_URL=... node --conditions=react-server --experimental-test-module-mocks --import tsx --test --test-force-exit tests/admin-roles-routes.test.ts
// Only next/headers is replaced (it needs a running Next request); the cookie it returns is a real session token stored in AuthSession.
const databaseUrl = process.env.DATABASE_URL ?? "";
const safe = /\/[^/?]*test[^/?]*(\?|$)/i.test(databaseUrl);
const skip = process.env.ROLES_TEST_DB === "1" && safe && typeof (mock as { module?: unknown }).module === "function" ? false : "set ROLES_TEST_DB=1, a disposable DATABASE_URL (name contains 'test') and --experimental-test-module-mocks";
process.env.NEXTAUTH_SECRET ??= "test-nextauth-secret-0123456789abcdef0123";
process.env.NEXTAUTH_URL = "http://localhost:4123";
process.env.AUTH_SESSION_SECRET ??= "test-session-secret-0123456789abcdef0123";
process.env.AUTH_TOTP_ENCRYPTION_KEY ??= "dGVzdC10b3RwLWtleS1mb3ItYW5hbHl0aWNzLXRlc3Q=";
process.env.AUTH_BOOTSTRAP_EMAIL ??= "test@example.com";
delete process.env.AUTH_DISABLED_DEV;

let currentToken: string | null = null;
let mocked = false;

async function setup() {
  if (!mocked) {
  mocked = true;
  mock.module("next/headers", {
    namedExports: {
      cookies: async () => ({ get: (name: string) => (currentToken && name.includes("metadeals-session") ? { value: currentToken } : undefined), set: () => {} }),
      headers: async () => new Headers(),
    },
  });
  }
  const { getDatabase } = await import("../src/server/db/client");
  const { createOpaqueToken, hashOpaqueToken } = await import("../src/server/auth/crypto");
  const route = await import("../src/app/api/v1/admin/[...path]/route");
  const db = getDatabase();
  const secret = process.env.AUTH_SESSION_SECRET!;
  const people: Record<string, string> = {};
  const stamp = Date.now();
  for (const role of ["EDITOR", "ADMIN", "SUPER_ADMIN"] as const) {
    const email = `roles-test-${role.toLowerCase()}-${stamp}@example.test`;
    await db.user.deleteMany({ where: { email } });
    const user = await db.user.create({ data: { email, name: role, role, status: "ACTIVE", totpEnabledAt: new Date(), passwordHash: "x" } });
    const token = createOpaqueToken(32);
    const now = Date.now();
    await db.authSession.create({ data: { userId: user.id, tokenHash: hashOpaqueToken(token, secret), expiresAt: new Date(now + 3_600_000), absoluteExpiresAt: new Date(now + 3_600_000 * 12) } });
    people[role] = token;
  }
  const call = async (as: string | null, method: string, path: string[], body: unknown = {}) => {
    currentToken = as ? people[as] ?? as : null;
    const url = `http://localhost:4123/api/v1/admin/${path.join("/")}`;
    const init: RequestInit = { method, headers: { origin: "http://localhost:4123", "content-type": "application/json" }, ...(method === "GET" || method === "DELETE" ? {} : { body: JSON.stringify(body) }) };
    const handler = (route as unknown as Record<string, (r: Request, c: { params: Promise<{ path: string[] }> }) => Promise<Response>>)[method];
    return (await handler(new Request(url, init), { params: Promise.resolve({ path }) })).status;
  };
  const cleanup = async () => {
    await db.authSession.deleteMany({ where: { user: { email: { startsWith: "roles-test-" } } } });
    await db.user.deleteMany({ where: { email: { startsWith: "roles-test-" } } });
  };
  return { db, call, cleanup, people };
}

const forbidden = (status: number) => status === 403;
const notDenied = (status: number) => status !== 401 && status !== 403;

test("without a session every admin route answers 401", { skip }, async () => {
  const { call, cleanup } = await setup();
  try {
    for (const [method, path] of [["GET", ["deals"]], ["GET", ["merchants"]], ["POST", ["categories"]], ["DELETE", ["categories", "x"]], ["GET", ["cuelinks"]], ["POST", ["scraper", "scan"]]] as const) {
      assert.equal(await call(null, method, [...path]), 401, `${method} ${path.join("/")}`);
    }
  } finally { await cleanup(); }
});

test("EDITOR is refused where the permission table says so; ADMIN and SUPER_ADMIN are not", { skip }, async () => {
  const { call, cleanup } = await setup();
  try {
    const cases: Array<[string, string[], unknown?]> = [
      ["POST", ["merchant-websites"], { domain: "example.in" }],
      ["PATCH", ["merchant-websites", "nope"], { pushToHome: true }],
      ["DELETE", ["merchant-websites", "nope"]],
      ["DELETE", ["categories", "nope"]],
      ["POST", ["categories"], { slug: "zz", name: "ZZ", parentId: null }],
      ["POST", ["merchants"], { slug: "zz", name: "ZZ", websiteUrl: "https://zz.in", affiliateHosts: [] }],
      ["POST", ["scraper", "candidates"], {}],
      ["POST", ["scraper", "scan"], { connectorCode: "x" }],
      ["GET", ["cuelinks"]],
      ["POST", ["cuelinks"], { action: "convert", url: "https://www.flipkart.com/x" }],
    ];
    for (const [method, path, body] of cases) {
      const label = `${method} ${path.join("/")}`;
      assert.ok(forbidden(await call("EDITOR", method, path, body)), `EDITOR must be refused: ${label}`);
      assert.ok(notDenied(await call("ADMIN", method, path, body)), `ADMIN must not be refused by permission: ${label}`);
      assert.ok(notDenied(await call("SUPER_ADMIN", method, path, body)), `SUPER_ADMIN must not be refused by permission: ${label}`);
    }
    assert.ok(notDenied(await call("EDITOR", "GET", ["deals"])), "EDITOR keeps deal work");
  } finally { await cleanup(); }
});

test("a cross-site write is refused even with a valid session, and an expired session is refused", { skip }, async () => {
  const { db, call, cleanup, people } = await setup();
  try {
    currentToken = people.ADMIN;
    const route = await import("../src/app/api/v1/admin/[...path]/route");
    const post = (route as unknown as { POST: (r: Request, c: { params: Promise<{ path: string[] }> }) => Promise<Response> }).POST;
    const foreign = await post(new Request("http://localhost:4123/api/v1/admin/categories", { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" }, body: "{}" }), { params: Promise.resolve({ path: ["categories"] }) });
    assert.equal(foreign.status, 403, "foreign Origin");
    const noOrigin = await post(new Request("http://localhost:4123/api/v1/admin/categories", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }), { params: Promise.resolve({ path: ["categories"] }) });
    assert.equal(noOrigin.status, 403, "no Origin header");
    await db.authSession.updateMany({ where: { user: { email: { startsWith: "roles-test-admin" } } }, data: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal(await call("ADMIN", "GET", ["deals"]), 401, "an expired session no longer works");
    await db.user.updateMany({ where: { email: { startsWith: "roles-test-editor" } }, data: { status: "SUSPENDED" } });
    assert.equal(await call("EDITOR", "GET", ["deals"]), 401, "a suspended account's session stops working at once");
  } finally { await cleanup(); }
});
