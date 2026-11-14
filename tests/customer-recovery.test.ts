import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";

// Needs a DISPOSABLE migrated database (name contains "test"): LOGIN_TEST_DB=1 DATABASE_URL=... node --test --test-force-exit tests/customer-recovery.test.ts
const databaseUrl = process.env.DATABASE_URL ?? "";
const safe = /\/[^/?]*test[^/?]*(\?|$)/i.test(databaseUrl);
const skip = process.env.LOGIN_TEST_DB === "1" && safe ? false : "set LOGIN_TEST_DB=1 and point DATABASE_URL at a disposable database whose name contains 'test'";
process.env.NEXTAUTH_SECRET ??= "test-nextauth-secret-0123456789abcdef0123";
process.env.NEXTAUTH_URL ??= "http://localhost:4123";
process.env.AUTH_SESSION_SECRET ??= "test-session-secret-0123456789abcdef0123";
process.env.AUTH_TOTP_ENCRYPTION_KEY ??= "dGVzdC10b3RwLWtleS1mb3ItYW5hbHl0aWNzLXRlc3Q=";
process.env.AUTH_BOOTSTRAP_EMAIL ??= "test@example.com";
process.env.CUSTOMER_EMAIL_MODE = "local";

const EMAIL = "recovery-user@example.test", HANDLE = "recovery_user", PASSWORD = "Correct-Horse-Battery-9!", NEW_PASSWORD = "Another-Horse-Staple-7!";

async function setup() {
  const { getDatabase } = await import("../src/server/db/client");
  const service = await import("../src/server/customer/service");
  const { hashPassword } = await import("../src/server/auth/crypto");
  const db = getDatabase();
  const wipe = async () => { await db.customerRateLimit.deleteMany({}); await db.forumProfile.deleteMany({ where: { handle: HANDLE } }); await db.customer.deleteMany({ where: { email: EMAIL } }); };
  await wipe();
  const customer = await db.customer.create({ data: { name: "Recovery", email: EMAIL, passwordHash: await hashPassword(PASSWORD), emailVerifiedAt: new Date() } });
  await db.forumProfile.create({ data: { customerId: customer.id, handle: HANDLE } });
  return { db, service, wipe };
}
const lastCode = async (challengeId: string) => {
  const file = path.join(process.cwd(), ".local", "email-outbox", challengeId + ".json");
  const mail = JSON.parse(await readFile(file, "utf8")) as { text: string; to: string };
  await rm(file, { force: true });
  return { code: /(\d{6})/.exec(mail.text)![1], to: mail.to };
};

test("sign in with the user name or the email; unknown names look like unknown emails; remember me is reported", { skip }, async () => {
  const { service, wipe } = await setup();
  try {
    assert.equal((await service.loginCustomer({ email: EMAIL, password: PASSWORD }, "198.51.100.21"))?.email, EMAIL);
    assert.equal((await service.loginCustomer({ email: HANDLE, password: PASSWORD }, "198.51.100.22"))?.email, EMAIL, "user name works");
    assert.equal((await service.loginCustomer({ email: HANDLE.toUpperCase(), password: PASSWORD }, "198.51.100.23"))?.email, EMAIL, "case is ignored");
    assert.equal(await service.loginCustomer({ email: HANDLE, password: "wrong-password-1" }, "198.51.100.24"), null);
    assert.equal(await service.loginCustomer({ email: "no_such_member", password: PASSWORD }, "198.51.100.25"), null);
    assert.equal(await service.loginCustomer({ email: "a b", password: PASSWORD }, "198.51.100.26"), null, "malformed names are refused");
    assert.equal((await service.loginCustomer({ email: HANDLE, password: PASSWORD, remember: "on" }, "198.51.100.27"))?.remember, true);
    assert.equal((await service.loginCustomer({ email: HANDLE, password: PASSWORD }, "198.51.100.28"))?.remember, false);
    // Failures under the user name count against the same account as failures under the email.
    for (let i = 0; i < 8; i++) await service.loginCustomer({ email: i % 2 ? HANDLE : EMAIL, password: "bad-" + i }, "203.0.113.90");
    assert.equal(await service.loginCustomer({ email: EMAIL, password: PASSWORD }, "203.0.113.90"), null, "mixing names does not reset the per-address limit");
  } finally { await wipe(); }
});

test("forgot password: same answer for everyone, code by email, new password works, old one does not, code is single use", { skip }, async () => {
  const { service, db, wipe } = await setup();
  try {
    const ghost = await service.requestPasswordReset({ email: "ghost@example.test" });
    const real = await service.requestPasswordReset({ email: HANDLE });
    assert.match(ghost.challengeId, /^[0-9a-f-]{36}$/); assert.match(real.challengeId, /^[0-9a-f-]{36}$/);
    assert.deepEqual(Object.keys(ghost).sort(), Object.keys(real).sort(), "same shape for unknown and known accounts");
    assert.equal(await db.customerPasswordReset.count({ where: { id: ghost.challengeId } }), 0, "nothing is stored for an unknown account");
    const { code, to } = await lastCode(real.challengeId);
    assert.equal(to, EMAIL, "the code goes to the account's own email address");
    const row = await db.customerPasswordReset.findUniqueOrThrow({ where: { id: real.challengeId } });
    assert.notEqual(row.codeHash, code, "only a hash of the code is stored");

    await assert.rejects(() => service.confirmPasswordReset({ challengeId: real.challengeId, code: "000000" === code ? "111111" : "000000", password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD }), /Incorrect code/);
    await assert.rejects(() => service.confirmPasswordReset({ challengeId: real.challengeId, code, password: NEW_PASSWORD, confirmPassword: "different-1234" }));
    await assert.rejects(() => service.confirmPasswordReset({ challengeId: real.challengeId, code, password: "short", confirmPassword: "short" }));
    assert.deepEqual(await service.confirmPasswordReset({ challengeId: real.challengeId, code, password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD }), { reset: true });
    assert.equal(await service.loginCustomer({ email: EMAIL, password: PASSWORD }, "198.51.100.31"), null, "the old password no longer works");
    assert.equal((await service.loginCustomer({ email: EMAIL, password: NEW_PASSWORD }, "198.51.100.32"))?.email, EMAIL);
    await assert.rejects(() => service.confirmPasswordReset({ challengeId: real.challengeId, code, password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD }), /expired|exhausted/i, "a used code cannot be used again");

    // Five wrong tries lock the request, and asking too often is silently limited.
    const second = await service.requestPasswordReset({ email: EMAIL }); await lastCode(second.challengeId);
    for (let i = 0; i < 5; i++) await service.confirmPasswordReset({ challengeId: second.challengeId, code: "123456", password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD }).catch(() => {});
    await assert.rejects(() => service.confirmPasswordReset({ challengeId: second.challengeId, code: "123456", password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD }), /exhausted/i);
    for (let i = 0; i < 3; i++) await service.requestPasswordReset({ email: EMAIL }).catch(() => {});
    assert.equal(await db.customerPasswordReset.count({ where: { customer: { email: EMAIL } } }) <= 1, true, "only one pending request per account");
  } finally {
    await wipe();
    const dir = path.join(process.cwd(), ".local", "email-outbox");
    for (const f of await readdir(dir).catch(() => [] as string[])) if (f.endsWith(".json")) { const t = await readFile(path.join(dir, f), "utf8").catch(() => ""); if (t.includes(EMAIL)) await rm(path.join(dir, f), { force: true }); }
  }
});

test("remember me: the sign-in token lasts 30 days with it and 24 hours without it", async () => {
  process.env.NEXTAUTH_URL ??= "http://localhost:4123";
  const { getCustomerAuthOptions } = await import("../src/server/customer/options");
  const { decode } = await import("next-auth/jwt");
  const options = getCustomerAuthOptions();
  const secret = options.secret as string;
  const lifetime = async (remember: boolean) => {
    const token = await options.jwt!.encode!({ token: { customerId: "x", remember }, secret, maxAge: 30 * 86400 });
    const body = await decode({ token, secret });
    return Math.round(((body!.exp as number) - (body!.iat as number)) / 3600);
  };
  assert.equal(await lifetime(true), 30 * 24);
  assert.equal(await lifetime(false), 24);
});
