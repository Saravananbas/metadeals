import assert from "node:assert/strict";
import test, { mock } from "node:test";
import * as OTPAuth from "otpauth";
import { can } from "../src/server/auth/permissions";
import { ACCESS_MODULES, DELEGABLE_PERMISSIONS, effectiveAccess, levelsFor, permissionsFor } from "../src/server/auth/modules";

// Database part runs only on a DISPOSABLE migrated database (name contains "test"):
//   ROLES_TEST_DB=1 DATABASE_PROVIDER=mysql DATABASE_URL=... node --conditions=react-server --experimental-test-module-mocks --import tsx --test --test-force-exit tests/account-access.test.ts
const databaseUrl = process.env.DATABASE_URL ?? "";
const safe = /\/[^/?]*test[^/?]*(\?|$)/i.test(databaseUrl);
const skip = process.env.ROLES_TEST_DB === "1" && safe && typeof (mock as { module?: unknown }).module === "function" ? false : "set ROLES_TEST_DB=1, a disposable DATABASE_URL (name contains 'test') and --experimental-test-module-mocks";
process.env.NEXTAUTH_SECRET ??= "test-nextauth-secret-0123456789abcdef0123";
process.env.NEXTAUTH_URL = "http://localhost:4123";
process.env.AUTH_SESSION_SECRET ??= "test-session-secret-0123456789abcdef0123";
process.env.AUTH_TOTP_ENCRYPTION_KEY ??= "dGVzdC10b3RwLWtleS1mb3ItYW5hbHl0aWNzLXRlc3Q=";
process.env.AUTH_BOOTSTRAP_EMAIL ??= "test@example.com";
delete process.env.AUTH_DISABLED_DEV;

test("can(): a person's own list replaces the role defaults; no list means the role applies", () => {
  assert.equal(can({ role: "EDITOR" }, "deal:publish"), true, "role default");
  assert.equal(can({ role: "EDITOR", permissions: ["analytics:view"] }, "deal:publish"), false, "list replaces the role");
  assert.equal(can({ role: "EDITOR", permissions: ["analytics:view"] }, "analytics:view"), true);
  assert.equal(can({ role: "ADMIN", permissions: null }, "analytics:view"), true, "null means role defaults");
  assert.equal(can({ role: "EDITOR" }, "analytics:view"), false, "editors never had analytics");
});

test("effectiveAccess: Super Admin is never customised, expired lists fall back, non-delegable grants are ignored", () => {
  const now = new Date("2026-11-20T10:00:00Z");
  const base = { role: "EDITOR", customAccess: true, customAccessUntil: null as Date | null, grants: ["analytics:view", "account:suspend", "security:manage"] };
  assert.deepEqual(effectiveAccess(base, now), ["analytics:view"], "only delegable permissions survive");
  assert.equal(effectiveAccess({ ...base, role: "SUPER_ADMIN" }, now), null);
  assert.equal(effectiveAccess({ ...base, customAccess: false }, now), null);
  assert.equal(effectiveAccess({ ...base, customAccessUntil: new Date("2026-11-20T09:00:00Z") }, now), null, "ended");
  assert.deepEqual(effectiveAccess({ ...base, customAccessUntil: new Date("2026-11-21T09:00:00Z") }, now), ["analytics:view"]);
  assert.equal(effectiveAccess(null, now), null);
});

test("module catalogue: levels only use delegable permissions, never account, security or audit powers", () => {
  for (const p of DELEGABLE_PERMISSIONS) assert.ok(!/^(account|security|audit):/.test(p), p);
  assert.deepEqual(permissionsFor({ deals: "publish", analytics: "view" }).sort(), ["analytics:view", "deal:create", "deal:edit", "deal:publish"]);
  assert.throws(() => permissionsFor({ deals: "nope" }));
  assert.throws(() => permissionsFor({ accounts: "manage" }));
  assert.deepEqual(levelsFor(["deal:create", "deal:edit", "deal:publish", "analytics:view"]), { deals: "publish", analytics: "view" });
  assert.equal(ACCESS_MODULES.length >= 8, true);
});

async function setup() {
  const { getDatabase } = await import("../src/server/db/client");
  const { createTotpSecret, encryptTotpSecret, createOpaqueToken, hashOpaqueToken } = await import("../src/server/auth/crypto");
  const db = getDatabase();
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const key = process.env.AUTH_TOTP_ENCRYPTION_KEY!;
  let n = 0;
  async function person(role: "SUPER_ADMIN" | "ADMIN" | "EDITOR") {
    const secret = createTotpSecret();
    const user = await db.user.create({ data: { email: `access-test-${role.toLowerCase()}-${stamp}-${n++}@example.test`, name: role, role, status: "ACTIVE", totpEnabledAt: new Date(), totpSecretEncrypted: encryptTotpSecret(secret, key), passwordHash: "x" } });
    const token = createOpaqueToken(32);
    await db.authSession.create({ data: { userId: user.id, tokenHash: hashOpaqueToken(token, process.env.AUTH_SESSION_SECRET!), expiresAt: new Date(Date.now() + 3_600_000), absoluteExpiresAt: new Date(Date.now() + 36_000_000) } });
    return { ...user, secret, token };
  }
  const code = (secret: string, offset = 0) => new OTPAuth.TOTP({ algorithm: "SHA1", digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secret) }).generate({ timestamp: Date.now() + offset * 30_000 });
  const cleanup = async () => {
    await db.authSession.deleteMany({ where: { user: { email: { startsWith: "access-test-" } } } });
    await db.authRateLimit.deleteMany({});
    await db.user.deleteMany({ where: { email: { startsWith: "access-test-" } } });
  };
  return { db, person, code, cleanup };
}

test("setAccountAccess: super admin only, needs the code, saves the list, resets to role defaults", { skip }, async () => {
  const { db, person, code, cleanup } = await setup();
  try {
    const { setAccountAccess } = await import("../src/server/auth/account-access");
    const { resolveAccess } = await import("../src/server/auth/access");
    const meta = { ipHash: null, userAgent: null, requestId: "access-test" };
    const boss = await person("SUPER_ADMIN"), admin = await person("ADMIN"), editor = await person("EDITOR"), otherBoss = await person("SUPER_ADMIN");
    const choice = { analytics: "view", intelligence: "view" };

    await assert.rejects(() => setAccountAccess({ actorId: admin.id, actorRole: "ADMIN", targetId: editor.id, useRoleDefaults: false, choice, totp: code(admin.secret), metadata: meta }), /super administrator/i);
    await assert.rejects(() => setAccountAccess({ actorId: boss.id, actorRole: "SUPER_ADMIN", targetId: boss.id, useRoleDefaults: false, choice, totp: code(boss.secret), metadata: meta }), /your own/i);
    await assert.rejects(() => setAccountAccess({ actorId: boss.id, actorRole: "SUPER_ADMIN", targetId: otherBoss.id, useRoleDefaults: false, choice, totp: code(boss.secret, -1), metadata: meta }), /always has full access/i);
    await assert.rejects(() => setAccountAccess({ actorId: boss.id, actorRole: "SUPER_ADMIN", targetId: editor.id, useRoleDefaults: false, choice: {}, totp: code(boss.secret), metadata: meta }), /at least one module/i);
    await assert.rejects(() => setAccountAccess({ actorId: boss.id, actorRole: "SUPER_ADMIN", targetId: editor.id, useRoleDefaults: false, choice: { accounts: "manage" }, totp: code(boss.secret), metadata: meta }), /not valid/i);
    await assert.rejects(() => setAccountAccess({ actorId: boss.id, actorRole: "SUPER_ADMIN", targetId: editor.id, useRoleDefaults: false, choice, totp: "000000", metadata: meta }), /authenticator/i);
    assert.equal(await resolveAccess(editor.id), null, "nothing changed yet");

    await setAccountAccess({ actorId: boss.id, actorRole: "SUPER_ADMIN", targetId: editor.id, useRoleDefaults: false, choice, until: new Date(Date.now() + 7 * 24 * 3_600_000), totp: code(boss.secret, 0), metadata: meta });
    assert.deepEqual((await resolveAccess(editor.id))?.sort(), ["analytics:view", "intelligence:view"]);

    await db.user.update({ where: { id: editor.id }, data: { customAccessUntil: new Date(Date.now() - 1000) } });
    assert.equal(await resolveAccess(editor.id), null, "after the end date the role applies again");
    await db.user.update({ where: { id: editor.id }, data: { customAccessUntil: null } });

    await setAccountAccess({ actorId: boss.id, actorRole: "SUPER_ADMIN", targetId: editor.id, useRoleDefaults: true, totp: code(boss.secret, 1), metadata: meta });
    assert.equal(await resolveAccess(editor.id), null);
    assert.equal(await db.staffPermissionGrant.count({ where: { userId: editor.id } }), 0);
  } finally { await cleanup(); }
});

test("real sessions: a person with a chosen list reaches only those parts of the admin API", { skip }, async () => {
  let currentToken: string | null = null;
  mock.module("next/headers", {
    namedExports: {
      cookies: async () => ({ get: (name: string) => (currentToken && name.includes("metadeals-session") ? { value: currentToken } : undefined), set: () => {} }),
      headers: async () => new Headers(),
    },
  });
  const { person, db, cleanup } = await setup();
  try {
    const route = await import("../src/app/api/v1/admin/[...path]/route");
    const call = async (token: string, method: string, path: string[]) => {
      currentToken = token;
      const handler = (route as unknown as Record<string, (r: Request, c: { params: Promise<{ path: string[] }> }) => Promise<Response>>)[method];
      return (await handler(new Request(`http://localhost:4123/api/v1/admin/${path.join("/")}`, { method, headers: { origin: "http://localhost:4123" } }), { params: Promise.resolve({ path }) })).status;
    };
    const editor = await person("EDITOR");
    assert.notEqual(await call(editor.token, "GET", ["deals"]), 403, "editor by role may list deals");
    assert.equal(await call(editor.token, "GET", ["analytics", "tab", "overview"]), 403, "editor by role has no analytics");

    await db.user.update({ where: { id: editor.id }, data: { customAccess: true } });
    await db.staffPermissionGrant.create({ data: { userId: editor.id, permission: "analytics:view" } });
    assert.equal(await call(editor.token, "GET", ["analytics", "tab", "overview"]), 200, "analytics view now allowed");
    assert.equal(await call(editor.token, "GET", ["deals"]), 403, "deals no longer allowed: the list replaced the role");
    assert.equal(await call(editor.token, "GET", ["scraper", "metrics"]), 403);
    assert.equal(await call(editor.token, "GET", ["notifications"]), 200, "the notification panel is open to anyone with a module");
  } finally { await cleanup(); }
});
