import assert from "node:assert/strict";
import test from "node:test";
import * as OTPAuth from "otpauth";
import type { UserRole } from "../src/generated/prisma/client";
import { suspensionBlocks, suspensionEnded } from "../src/server/auth/suspension";

// Database part runs only on a DISPOSABLE migrated database (name contains "test"):
//   ROLES_TEST_DB=1 DATABASE_PROVIDER=mysql DATABASE_URL=... node --conditions=react-server --import tsx --test --test-force-exit tests/account-state.test.ts
const databaseUrl = process.env.DATABASE_URL ?? "";
const safe = /\/[^/?]*test[^/?]*(\?|$)/i.test(databaseUrl);
const skip = process.env.ROLES_TEST_DB === "1" && safe ? false : "set ROLES_TEST_DB=1 and a disposable DATABASE_URL (name contains 'test')";
process.env.NEXTAUTH_SECRET ??= "test-nextauth-secret-0123456789abcdef0123";
process.env.NEXTAUTH_URL = "http://localhost:4123";
process.env.AUTH_SESSION_SECRET ??= "test-session-secret-0123456789abcdef0123";
process.env.AUTH_TOTP_ENCRYPTION_KEY ??= "dGVzdC10b3RwLWtleS1mb3ItYW5hbHl0aWNzLXRlc3Q=";
process.env.AUTH_BOOTSTRAP_EMAIL ??= "test@example.com";

const at = (iso: string) => new Date(iso);

test("suspension window: blocks only between start and end", () => {
  const now = at("2026-11-20T10:00:00Z");
  const base = { status: "SUSPENDED", suspendedFrom: at("2026-11-20T09:00:00Z"), suspendedUntil: at("2026-11-21T09:00:00Z") };
  assert.equal(suspensionBlocks(base, now), true);
  assert.equal(suspensionBlocks({ ...base, suspendedFrom: at("2026-11-20T11:00:00Z") }, now), false, "not started yet");
  assert.equal(suspensionBlocks({ ...base, suspendedUntil: at("2026-11-20T09:30:00Z") }, now), false, "already over");
  assert.equal(suspensionBlocks({ ...base, suspendedFrom: null }, now), true, "no start means immediately");
  assert.equal(suspensionBlocks({ status: "ACTIVE", suspendedFrom: at("2026-11-20T09:00:00Z"), suspendedUntil: at("2026-11-21T09:00:00Z") }, now), true, "scheduled window that has started");
  assert.equal(suspensionBlocks({ status: "ACTIVE", suspendedFrom: null, suspendedUntil: null }, now), false);
  assert.equal(suspensionBlocks({ status: "DISABLED", suspendedFrom: null, suspendedUntil: at("2026-11-21T09:00:00Z") }, now), false, "disabled is blocked by its own status, not by a window");
});

test("suspension ended: only a timed SUSPENDED row whose end has passed", () => {
  const now = at("2026-11-20T10:00:00Z");
  assert.equal(suspensionEnded({ status: "SUSPENDED", suspendedFrom: null, suspendedUntil: at("2026-11-20T09:00:00Z") }, now), true);
  assert.equal(suspensionEnded({ status: "SUSPENDED", suspendedFrom: null, suspendedUntil: at("2026-11-20T11:00:00Z") }, now), false);
  assert.equal(suspensionEnded({ status: "SUSPENDED", suspendedFrom: null, suspendedUntil: null }, now), false, "an old open-ended suspension stays");
  assert.equal(suspensionEnded({ status: "ACTIVE", suspendedFrom: null, suspendedUntil: at("2026-11-20T09:00:00Z") }, now), false);
});

async function setup() {
  const { getDatabase } = await import("../src/server/db/client");
  const { createTotpSecret, encryptTotpSecret, createOpaqueToken, hashOpaqueToken } = await import("../src/server/auth/crypto");
  const { changeAccountState } = await import("../src/server/auth/account-state");
  const db = getDatabase();
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const meta = { ipHash: null, userAgent: null, requestId: "account-state-test" };
  const key = process.env.AUTH_TOTP_ENCRYPTION_KEY!;
  let n = 0;
  async function person(role: "SUPER_ADMIN" | "ADMIN" | "EDITOR" | "COMMUNITY_MODERATOR", status: "ACTIVE" | "PENDING_SETUP" = "ACTIVE") {
    const secret = createTotpSecret();
    const user = await db.user.create({ data: { email: `acct-test-${role.toLowerCase()}-${stamp}-${n++}@example.test`, name: role, role, status, totpEnabledAt: new Date(), totpSecretEncrypted: encryptTotpSecret(secret, key), passwordHash: "x" } });
    const token = createOpaqueToken(32);
    await db.authSession.create({ data: { userId: user.id, tokenHash: hashOpaqueToken(token, process.env.AUTH_SESSION_SECRET!), expiresAt: new Date(Date.now() + 3_600_000), absoluteExpiresAt: new Date(Date.now() + 36_000_000) } });
    return { ...user, secret };
  }
  /** A valid authenticator code for the 30-second step that is `offset` steps away from now (the check accepts one step either side). */
  const code = (secret: string, offset = 0) => new OTPAuth.TOTP({ algorithm: "SHA1", digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secret) }).generate({ timestamp: Date.now() + offset * 30_000 });
  const run = (actor: { id: string; role: UserRole }, targetId: string, action: "suspend" | "disable" | "enable" | "delete", extra: Record<string, unknown> = {}) =>
    changeAccountState({ actorId: actor.id, actorRole: actor.role, targetId, action, metadata: meta, ...extra });
  const cleanup = async () => {
    await db.authSession.deleteMany({ where: { user: { email: { startsWith: "acct-test-" } } } });
    await db.authRateLimit.deleteMany({});
    await db.user.deleteMany({ where: { email: { startsWith: "acct-test-" } } });
  };
  return { db, person, code, run, cleanup };
}

test("disable, enable and delete need the actor's authenticator code, and a code works once", { skip }, async () => {
  const { db, person, code, run, cleanup } = await setup();
  try {
    const actor = await person("SUPER_ADMIN"), target = await person("EDITOR");
    await assert.rejects(() => run(actor, target.id, "disable"), /authenticator code/i, "no code");
    await assert.rejects(() => run(actor, target.id, "disable", { totp: "000000" }), /authenticator code/i, "wrong code");
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: target.id } })).status, "ACTIVE");

    await run(actor, target.id, "disable", { totp: code(actor.secret, -1) });
    const disabled = await db.user.findUniqueOrThrow({ where: { id: target.id } });
    assert.equal(disabled.status, "DISABLED");
    assert.equal(await db.authSession.count({ where: { userId: target.id } }), 0, "signed out");
    await assert.rejects(() => run(actor, target.id, "enable", { totp: code(actor.secret, -1) }), /already used/i, "the same code cannot be replayed");

    await run(actor, target.id, "enable", { totp: code(actor.secret, 0) });
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: target.id } })).status, "ACTIVE");

    await run(actor, target.id, "delete", { totp: code(actor.secret, 1) });
    const deleted = await db.user.findUnique({ where: { id: target.id } });
    assert.equal(deleted?.status, "DELETED", "the row is kept, only hidden");
  } finally { await cleanup(); }
});

test("suspend needs a reason and a future end, signs the person out, and enable lifts it", { skip }, async () => {
  const { db, person, code, run, cleanup } = await setup();
  try {
    const actor = await person("SUPER_ADMIN"), target = await person("EDITOR");
    const day = 24 * 3_600_000;
    await assert.rejects(() => run(actor, target.id, "suspend", { suspendedFrom: new Date(), suspendedUntil: new Date(Date.now() + day), reason: "x" }), /reason/i);
    await assert.rejects(() => run(actor, target.id, "suspend", { suspendedFrom: new Date(), suspendedUntil: new Date(Date.now() - day), reason: "Away on leave" }), /future/i);
    await assert.rejects(() => run(actor, target.id, "suspend", { suspendedFrom: new Date(Date.now() + 2 * day), suspendedUntil: new Date(Date.now() + day), reason: "Away on leave" }), /after the start/i);

    await run(actor, target.id, "suspend", { suspendedFrom: new Date(Date.now() - 1000), suspendedUntil: new Date(Date.now() + day), reason: "Away on leave" });
    const row = await db.user.findUniqueOrThrow({ where: { id: target.id } });
    assert.equal(row.status, "SUSPENDED");
    assert.equal(row.suspensionReason, "Away on leave");
    assert.equal(await db.authSession.count({ where: { userId: target.id } }), 0);

    await run(actor, target.id, "enable", { totp: code(actor.secret, 0) });
    const after = await db.user.findUniqueOrThrow({ where: { id: target.id } });
    assert.equal(after.status, "ACTIVE");
    assert.equal(after.suspendedUntil, null);
  } finally { await cleanup(); }
});

test("a suspension that starts later leaves the person active until then", { skip }, async () => {
  const { db, person, run, cleanup } = await setup();
  try {
    const actor = await person("SUPER_ADMIN"), target = await person("EDITOR");
    const day = 24 * 3_600_000;
    await run(actor, target.id, "suspend", { suspendedFrom: new Date(Date.now() + day), suspendedUntil: new Date(Date.now() + 2 * day), reason: "Planned leave" });
    const row = await db.user.findUniqueOrThrow({ where: { id: target.id } });
    assert.equal(row.status, "ACTIVE");
    assert.equal(suspensionBlocks(row), false);
    assert.equal(suspensionBlocks(row, new Date(Date.now() + day + 1000)), true);
    assert.equal(await db.authSession.count({ where: { userId: target.id } }), 1, "still signed in until the start");
  } finally { await cleanup(); }
});

test("who may do what: nobody changes themselves, admins only touch editors and cannot delete, moderators are refused", { skip }, async () => {
  const { person, code, run, cleanup } = await setup();
  try {
    const superAdmin = await person("SUPER_ADMIN"), admin = await person("ADMIN"), editor = await person("EDITOR"), otherAdmin = await person("ADMIN"), moderator = await person("COMMUNITY_MODERATOR");
    await assert.rejects(() => run(superAdmin, superAdmin.id, "disable", { totp: code(superAdmin.secret, 0) }), /yourself|your own/i);
    await assert.rejects(() => run(admin, otherAdmin.id, "disable", { totp: code(admin.secret, 0) }), /not permitted/i, "admin on admin");
    await assert.rejects(() => run(admin, editor.id, "delete", { totp: code(admin.secret, 0) }), /not permitted/i, "only a super admin deletes");
    await assert.rejects(() => run(editor, admin.id, "disable", { totp: code(editor.secret, 0) }), /not permitted/i, "editor");
    await assert.rejects(() => run(superAdmin, moderator.id, "disable", { totp: code(superAdmin.secret, 0) }), /moderator/i);
    await run(admin, editor.id, "suspend", { suspendedFrom: new Date(), suspendedUntil: new Date(Date.now() + 3_600_000), reason: "Short break" });
  } finally { await cleanup(); }
});

test("a deleted account's email can be used again, and the new account starts clean", { skip }, async () => {
  const { db, person, code, run, cleanup } = await setup();
  const { createAccountSetupToken } = await import("../src/server/auth/service");
  try {
    const actor = await person("SUPER_ADMIN"), target = await person("ADMIN");
    await db.recoveryCode.create({ data: { userId: target.id, codeHash: "x" } });
    await run(actor, target.id, "delete", { totp: code(actor.secret, 0) });
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: target.id } })).status, "DELETED");

    const again = await createAccountSetupToken({ email: target.email!, role: "EDITOR", emailDeliveryVerified: true, actorId: actor.id, metadata: { ipHash: null, userAgent: null, requestId: "recreate" } });
    assert.equal(again.userId, target.id, "same row, so its history stays linked");
    const fresh = await db.user.findUniqueOrThrow({ where: { id: target.id } });
    assert.equal(fresh.status, "PENDING_SETUP");
    assert.equal(fresh.role, "EDITOR", "the role chosen now, not the old one");
    assert.equal(fresh.passwordHash, null);
    assert.equal(fresh.totpEnabledAt, null);
    assert.equal(fresh.totpSecretEncrypted, null, "the old authenticator is gone");
    assert.equal(await db.recoveryCode.count({ where: { userId: target.id } }), 0);
    assert.equal(await db.authSession.count({ where: { userId: target.id } }), 0);

    // An account that is still active keeps its email.
    const live = await person("ADMIN");
    await assert.rejects(() => createAccountSetupToken({ email: live.email!, role: "ADMIN", emailDeliveryVerified: true, actorId: actor.id, metadata: { ipHash: null, userAgent: null, requestId: "dup" } }), /already exists/i);
  } finally { await cleanup(); }
});
