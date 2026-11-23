import assert from "node:assert/strict";
import test from "node:test";
import * as OTPAuth from "otpauth";

// Runs only on a DISPOSABLE migrated database (name contains "test"):
//   ROLES_TEST_DB=1 DATABASE_PROVIDER=mysql DATABASE_URL=... node --conditions=react-server --import tsx --test --test-force-exit --test-concurrency=1 tests/staff-lockout-and-temp-password.test.ts
const databaseUrl = process.env.DATABASE_URL ?? "";
const safe = /\/[^/?]*test[^/?]*(\?|$)/i.test(databaseUrl);
const skip = process.env.ROLES_TEST_DB === "1" && safe ? false : "set ROLES_TEST_DB=1 and a disposable DATABASE_URL (name contains 'test')";
process.env.NEXTAUTH_SECRET ??= "test-nextauth-secret-0123456789abcdef0123";
process.env.NEXTAUTH_URL = "http://localhost:4123";
process.env.AUTH_SESSION_SECRET ??= "test-session-secret-0123456789abcdef0123";
process.env.AUTH_TOTP_ENCRYPTION_KEY ??= "dGVzdC10b3RwLWtleS1mb3ItYW5hbHl0aWNzLXRlc3Q=";
process.env.AUTH_BOOTSTRAP_EMAIL ??= "test@example.com";

const PASSWORD = "Correct-Horse-Battery-42";
const NEW_PASSWORD = "Brand-New-Passphrase-77";
const meta = { ipHash: "net-test", userAgent: null, requestId: "staff-lockout-test" };

async function setup() {
  const { getDatabase } = await import("../src/server/db/client");
  const crypto = await import("../src/server/auth/crypto");
  const svc = await import("../src/server/auth/service");
  const db = getDatabase();
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  let n = 0;
  async function person(role: "SUPER_ADMIN" | "ADMIN" | "EDITOR" = "ADMIN") {
    const secret = crypto.createTotpSecret();
    const email = `lock-test-${role.toLowerCase()}-${stamp}-${n++}@example.test`;
    const user = await db.user.create({
      data: { email, name: role, role, status: "ACTIVE", emailVerified: new Date(), passwordHash: await crypto.hashPassword(PASSWORD), totpEnabledAt: new Date(), totpSecretEncrypted: crypto.encryptTotpSecret(secret, process.env.AUTH_TOTP_ENCRYPTION_KEY!) },
    });
    return { ...user, email, secret };
  }
  /** A valid authenticator code for the 30-second step `offset` steps from now (one step either side is accepted). */
  const code = (secret: string, offset = 0) => new OTPAuth.TOTP({ algorithm: "SHA1", digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secret) }).generate({ timestamp: Date.now() + offset * 30_000 });
  const login = (email: string, password: string, mfaCode: string, ipHash = "net-test") => svc.authenticate({ email, password, mfaCode, metadata: { ...meta, ipHash } });
  const wrongLogin = (email: string, ipHash = "net-test") => login(email, "Wrong-password-1!", "000000", ipHash);
  /** The short delay on the address and pair counters (1 second at the 5th failure) is over long before a 30-minute lock ends. */
  const afterShortDelays = () => new Promise((resolve) => setTimeout(resolve, 1200));
  const lockHash = (email: string) => crypto.hashRateLimitSubject(`email:${email.toLowerCase()}`, process.env.AUTH_SESSION_SECRET!);
  const cleanup = async () => {
    await db.authSession.deleteMany({ where: { user: { email: { startsWith: "lock-test-" } } } });
    await db.authToken.deleteMany({ where: { email: { startsWith: "lock-test-" } } });
    await db.authRateLimit.deleteMany({});
    await db.user.deleteMany({ where: { email: { startsWith: "lock-test-" } } });
  };
  return { db, svc, person, code, login, wrongLogin, lockHash, afterShortDelays, cleanup, stamp };
}

test("five failed sign-ins lock the account for 30 minutes, the right password no longer helps, and a finished lock starts fresh", { skip }, async () => {
  const { db, svc, person, code, login, wrongLogin, lockHash, cleanup } = await setup();
  try {
    const user = await person();
    for (let i = 0; i < 5; i++) await assert.rejects(() => wrongLogin(user.email), /Invalid email, password, or authenticator code/);
    const row = await db.authRateLimit.findUniqueOrThrow({ where: { subjectHash: lockHash(user.email) } });
    const minutes = (row.lockedUntil!.getTime() - Date.now()) / 60_000;
    assert.ok(minutes > 29 && minutes <= 30, `locked for about 30 minutes, was ${minutes}`);

    await assert.rejects(() => login(user.email, PASSWORD, code(user.secret)), (error: Error) => error.message === svc.ACCOUNT_LOCKED_MESSAGE, "locked even with the right details");
    const failuresWhileLocked = (await db.authRateLimit.findUniqueOrThrow({ where: { subjectHash: lockHash(user.email) } })).failures;
    await assert.rejects(() => wrongLogin(user.email), (error: Error) => error.message === svc.ACCOUNT_LOCKED_MESSAGE);
    assert.equal((await db.authRateLimit.findUniqueOrThrow({ where: { subjectHash: lockHash(user.email) } })).failures, failuresWhileLocked, "a locked account stops counting");

    await db.authRateLimit.updateMany({ data: { lockedUntil: new Date(Date.now() - 1000) } }); // 30 minutes later: every counter has run out
    const ok = await login(user.email, PASSWORD, code(user.secret, 0));
    assert.ok(ok.token, "after 30 minutes the account signs in again");
    assert.equal(await db.authRateLimit.count({ where: { subjectHash: lockHash(user.email) } }), 0, "and the count starts over");
  } finally { await cleanup(); }
});

test("an email that does not exist locks and answers exactly like one that does", { skip }, async () => {
  const { svc, person, wrongLogin, cleanup, stamp } = await setup();
  try {
    const real = await person();
    const ghost = `lock-test-nobody-${stamp}@example.test`;
    const outcomes: string[][] = [[], []];
    for (const [i, email] of [real.email, ghost].entries()) {
      for (let k = 0; k < 6; k++) outcomes[i].push(await wrongLogin(email, `net-${i}`).then(() => "no error", (e: Error) => e.message));
    }
    assert.deepEqual(outcomes[0], outcomes[1], "same messages at every step");
    assert.equal(outcomes[0][5], svc.ACCOUNT_LOCKED_MESSAGE);
  } finally { await cleanup(); }
});

test("a Super Admin reset link unlocks the account", { skip }, async () => {
  const { db, svc, person, code, login, wrongLogin, lockHash, afterShortDelays, cleanup } = await setup();
  try {
    const user = await person();
    for (let i = 0; i < 5; i++) await assert.rejects(() => wrongLogin(user.email));
    const { token } = await svc.createManualPasswordReset(user.email);
    await svc.completePasswordReset(token, NEW_PASSWORD, meta);
    assert.equal(await db.authRateLimit.count({ where: { subjectHash: lockHash(user.email) } }), 0, "lock cleared");
    await afterShortDelays();
    assert.ok((await login(user.email, NEW_PASSWORD, code(user.secret))).token);
  } finally { await cleanup(); }
});

test("forgot password: needs a valid authenticator code, answers null for everything else, and the code works once", { skip }, async () => {
  const { svc, person, code, cleanup, stamp } = await setup();
  try {
    const user = await person();
    assert.equal(await svc.requestTemporaryPassword({ email: user.email, mfaCode: "000000", metadata: meta }), null, "wrong code");
    assert.equal(await svc.requestTemporaryPassword({ email: `lock-test-nobody-${stamp}@example.test`, mfaCode: code(user.secret), metadata: meta }), null, "unknown email");
    const issued = await svc.requestTemporaryPassword({ email: user.email, mfaCode: code(user.secret, -1), metadata: meta });
    assert.ok(issued);
    assert.match(issued.tempPassword, /^[abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$/, "10 characters, no look-alikes");
    assert.equal(await svc.requestTemporaryPassword({ email: user.email, mfaCode: code(user.secret, -1), metadata: meta }), null, "the same code cannot be used twice");
  } finally { await cleanup(); }
});

test("the temporary password lasts 25 minutes, works once, and a new request replaces it", { skip }, async () => {
  const { db, svc, person, code, cleanup } = await setup();
  try {
    const user = await person();
    const first = await svc.requestTemporaryPassword({ email: user.email, mfaCode: code(user.secret, -1), metadata: meta });
    assert.ok(first);
    const row = await db.authToken.findFirstOrThrow({ where: { id: first.tokenId } });
    const minutes = (row.expiresAt.getTime() - Date.now()) / 60_000;
    assert.ok(minutes > 24 && minutes <= 25, `25 minutes, was ${minutes}`);
    assert.ok(row.passwordHash?.startsWith("$argon2id$"), "stored only as a hash");
    assert.ok(!JSON.stringify(row).includes(first.tempPassword), "never stored in plain text");

    const second = await svc.requestTemporaryPassword({ email: user.email, mfaCode: code(user.secret, 0), metadata: meta });
    assert.ok(second);
    assert.ok((await db.authToken.findFirstOrThrow({ where: { id: first.tokenId } })).revokedAt, "the earlier one is cancelled");
    await assert.rejects(() => svc.changePasswordWithTemporary({ email: user.email, tempPassword: first.tempPassword, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD, mfaCode: code(user.secret, 1), metadata: meta }), /temporary password or authenticator code/i, "the replaced password is dead");

    await db.authToken.update({ where: { id: second.tokenId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await assert.rejects(() => svc.changePasswordWithTemporary({ email: user.email, tempPassword: second.tempPassword, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD, mfaCode: code(user.secret, 1), metadata: meta }), /expired/i, "after 25 minutes it no longer works");
  } finally { await cleanup(); }
});

test("typing the temporary password at sign-in opens no session and is not a failure", { skip }, async () => {
  const { db, svc, person, code, login, lockHash, cleanup } = await setup();
  try {
    const user = await person();
    const issued = await svc.requestTemporaryPassword({ email: user.email, mfaCode: code(user.secret, -1), metadata: meta });
    assert.ok(issued);
    for (let i = 0; i < 6; i++) {
      await assert.rejects(() => login(user.email, issued.tempPassword, "123456"), (error: Error) => error instanceof svc.PasswordChangeRequired);
    }
    assert.equal(await db.authSession.count({ where: { userId: user.id } }), 0, "no session");
    assert.equal(await db.authRateLimit.count({ where: { subjectHash: lockHash(user.email) } }), 0, "no failure recorded, so it can never lock the account");
    assert.equal((await db.authToken.findFirstOrThrow({ where: { id: issued.tokenId } })).completedAt, null, "not used up by signing in");
  } finally { await cleanup(); }
});

test("choosing a new password with the temporary one: single use, ends every session, unlocks, and opens none", { skip }, async () => {
  const { db, svc, person, code, login, wrongLogin, lockHash, cleanup } = await setup();
  try {
    const user = await person();
    for (let i = 0; i < 5; i++) await assert.rejects(() => wrongLogin(user.email));
    await db.authSession.create({ data: { userId: user.id, tokenHash: "x".repeat(64), expiresAt: new Date(Date.now() + 3_600_000), absoluteExpiresAt: new Date(Date.now() + 3_600_000) } });
    // Locked, yet the way out stays open: asking for a temporary password needs only the authenticator code.
    const issued = await svc.requestTemporaryPassword({ email: user.email, mfaCode: code(user.secret, -1), metadata: meta });
    assert.ok(issued, "a locked account can still ask for a temporary password");

    const attempt = (over: Partial<{ tempPassword: string; newPassword: string; confirmPassword: string; mfaCode: string }> = {}) => svc.changePasswordWithTemporary({ email: user.email, tempPassword: issued.tempPassword, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD, mfaCode: code(user.secret, 0), metadata: meta, ...over });
    await assert.rejects(() => attempt({ confirmPassword: "something else 123" }), /do not match/i);
    await assert.rejects(() => attempt({ newPassword: issued.tempPassword, confirmPassword: issued.tempPassword }), /different/i);
    await assert.rejects(() => attempt({ newPassword: "short", confirmPassword: "short" }), /at least 8/i);
    await assert.rejects(() => attempt({ tempPassword: "WrongTemp99" }), /temporary password or authenticator code/i, "wrong temporary password");
    await assert.rejects(() => attempt({ mfaCode: "000000" }), /temporary password or authenticator code/i, "wrong code");

    await attempt({ mfaCode: code(user.secret, 1) });
    assert.equal(await db.authSession.count({ where: { userId: user.id } }), 0, "every sign-in of that account is ended, and none is opened");
    assert.equal(await db.authRateLimit.count({ where: { subjectHash: lockHash(user.email) } }), 0, "the lock is cleared");
    await assert.rejects(() => attempt({ mfaCode: code(user.secret, 1) }), /temporary password or authenticator code/i, "second use is refused");
    await assert.rejects(() => login(user.email, PASSWORD, code(user.secret, 1)), /Invalid email/, "the old password is gone");
    assert.equal(await db.authSession.count({ where: { userId: user.id } }), 0);
  } finally { await cleanup(); }
});

test("wrong temporary passwords or codes count toward the sign-in lock, and five of them burn the temporary password", { skip }, async () => {
  const { db, svc, person, code, wrongLogin, lockHash, cleanup } = await setup();
  try {
    const user = await person();
    const issued = await svc.requestTemporaryPassword({ email: user.email, mfaCode: code(user.secret, -1), metadata: meta });
    assert.ok(issued);
    for (let i = 0; i < 5; i++) {
      await assert.rejects(() => svc.changePasswordWithTemporary({ email: user.email, tempPassword: "WrongTemp99", newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD, mfaCode: code(user.secret, 0), metadata: meta }), /temporary password or authenticator code/i);
    }
    const lock = await db.authRateLimit.findUniqueOrThrow({ where: { subjectHash: lockHash(user.email) } });
    assert.ok(lock.lockedUntil && lock.lockedUntil > new Date(), "five wrong tries lock the account");
    await assert.rejects(() => wrongLogin(user.email), (error: Error) => error.message === svc.ACCOUNT_LOCKED_MESSAGE);
    const row = await db.authToken.findFirstOrThrow({ where: { id: issued.tokenId } });
    assert.ok(row.revokedAt, "the temporary password is burnt");
  } finally { await cleanup(); }
});

test("the request route gives the same answer whatever the outcome", { skip }, async () => {
  const { person, code, cleanup, stamp } = await setup();
  try {
    const user = await person();
    const route = await import("../src/app/api/auth/password-reset/request/route");
    const call = (body: unknown) => route.POST(new Request("http://localhost:4123/api/auth/password-reset/request", { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:4123", host: "localhost:4123" }, body: JSON.stringify(body) }));
    const a = await call({ email: user.email, mfaCode: "000000" });
    const b = await call({ email: `lock-test-nobody-${stamp}@example.test`, mfaCode: code(user.secret) });
    const c = await call({ email: user.email, mfaCode: code(user.secret, -1) });
    assert.deepEqual([a.status, b.status, c.status], [200, 200, 200]);
    const bodies = await Promise.all([a.json(), b.json(), c.json()]);
    assert.deepEqual(bodies[0], bodies[1]);
    assert.deepEqual(bodies[1], bodies[2]);
    assert.ok(!JSON.stringify(bodies).match(/[A-Za-z0-9]{10}\b.*temporary password is/), "the answer never carries the temporary password");
  } finally { await cleanup(); }
});
