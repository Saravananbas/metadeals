import assert from "node:assert/strict";
import test from "node:test";

// Needs a DISPOSABLE migrated database (name contains "test"): LOGIN_TEST_DB=1 DATABASE_URL=... node --test --test-force-exit tests/login-throttle.test.ts
const databaseUrl = process.env.DATABASE_URL ?? "";
const safe = /\/[^/?]*test[^/?]*(\?|$)/i.test(databaseUrl);
const skip = process.env.LOGIN_TEST_DB === "1" && safe ? false : "set LOGIN_TEST_DB=1 and point DATABASE_URL at a disposable database whose name contains 'test'";
process.env.NEXTAUTH_SECRET ??= "test-nextauth-secret-0123456789abcdef0123";
process.env.NEXTAUTH_URL ??= "http://localhost:4123";
process.env.AUTH_SESSION_SECRET ??= "test-session-secret-0123456789abcdef0123";
process.env.AUTH_TOTP_ENCRYPTION_KEY ??= "dGVzdC10b3RwLWtleS1mb3ItYW5hbHl0aWNzLXRlc3Q=";
process.env.AUTH_BOOTSTRAP_EMAIL ??= "test@example.com";

const EMAIL = "login-throttle-victim@example.test";
const OTHER = "login-throttle-bystander@example.test";
const PASSWORD = "Correct-Horse-Battery-9!";

async function setup() {
  const { getDatabase } = await import("../src/server/db/client");
  const service = await import("../src/server/customer/service");
  const { hashPassword } = await import("../src/server/auth/crypto");
  const db = getDatabase();
  const wipe = async () => { await db.customerRateLimit.deleteMany({}); await db.customer.deleteMany({ where: { email: { in: [EMAIL, OTHER] } } }); };
  await wipe();
  await db.customer.create({ data: { name: "Victim", email: EMAIL, passwordHash: await hashPassword(PASSWORD), emailVerifiedAt: new Date() } });
  await db.customer.create({ data: { name: "Bystander", email: OTHER, passwordHash: await hashPassword(PASSWORD), emailVerifiedAt: new Date() } });
  const isLock = (error: unknown) => error instanceof service.CustomerError && error.status === 423 && error.message === service.MEMBER_LOCKED_MESSAGE;
  /** 30 minutes later: every counter and lock has run out. */
  const thirtyMinutesLater = () => db.customerRateLimit.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
  return { db, loginCustomer: service.loginCustomer, service, wipe, isLock, thirtyMinutesLater };
}

test("five wrong passwords lock the account for 30 minutes, from any address; the right password no longer helps; after 30 minutes it works again", { skip }, async () => {
  const { loginCustomer, wipe, isLock, thirtyMinutesLater } = await setup();
  try {
    for (let i = 0; i < 5; i++) assert.equal(await loginCustomer({ email: EMAIL, password: "wrong-" + i }, "203.0.113.50"), null, "the first five just fail");
    await assert.rejects(() => loginCustomer({ email: EMAIL, password: PASSWORD }, "198.51.100.7"), isLock, "locked even for the right password from another address");
    await assert.rejects(() => loginCustomer({ email: EMAIL, password: "wrong" }, "198.51.100.8"), isLock, "and for a wrong one");
    await thirtyMinutesLater();
    assert.equal((await loginCustomer({ email: EMAIL, password: PASSWORD }, "198.51.100.7"))?.email, EMAIL, "signs in again after 30 minutes");
  } finally { await wipe(); }
});

test("an unknown email locks and answers exactly like a real account, and other accounts are not affected", { skip }, async () => {
  const { loginCustomer, wipe, isLock } = await setup();
  try {
    const ghost = "login-throttle-nobody@example.test";
    for (const email of [EMAIL, ghost]) {
      for (let i = 0; i < 5; i++) assert.equal(await loginCustomer({ email, password: "wrong-" + i }, "203.0.113.51"), null);
      await assert.rejects(() => loginCustomer({ email, password: "whatever-123" }, "203.0.113.52"), isLock, email);
    }
    assert.equal((await loginCustomer({ email: OTHER, password: PASSWORD }, "198.51.100.12"))?.email, OTHER, "an account nobody attacked still signs in");
  } finally { await wipe(); }
});

test("one address flooding sign-in is stopped without affecting others", { skip }, async () => {
  const { db, loginCustomer, wipe } = await setup();
  try {
    for (let i = 0; i < 61; i++) await loginCustomer({ email: `nobody${i % 15}@example.test`, password: "x" + i }, "203.0.113.60").catch(() => null);
    assert.equal(await loginCustomer({ email: EMAIL, password: PASSWORD }, "203.0.113.60"), null, "flooding address is blocked");
    assert.equal((await loginCustomer({ email: EMAIL, password: PASSWORD }, "198.51.100.8"))?.email, EMAIL, "other addresses are fine");
    void db;
  } finally { await wipe(); }
});

test("unknown email and wrong password look the same", { skip }, async () => {
  const { loginCustomer, wipe } = await setup();
  try {
    assert.equal(await loginCustomer({ email: "ghost@example.test", password: "whatever-123" }, "198.51.100.9"), null);
    assert.equal(await loginCustomer({ email: EMAIL, password: "wrong-password-123" }, "198.51.100.9"), null);
  } finally { await wipe(); }
});

test("a correct password clears the failures, so four wrong tries now and four later never lock", { skip }, async () => {
  const { loginCustomer, wipe } = await setup();
  try {
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < 4; i++) assert.equal(await loginCustomer({ email: EMAIL, password: "wrong-" + i }, "198.51.100.13"), null);
      assert.equal((await loginCustomer({ email: EMAIL, password: PASSWORD }, "198.51.100.13"))?.email, EMAIL, "round " + round);
    }
  } finally { await wipe(); }
});

test("distributed attack mode: the customer's usual address keeps working, a new address waits, attackers get nowhere", { skip }, async () => {
  const { service, loginCustomer, wipe } = await setup();
  try {
    const home = "198.51.100.21";
    assert.equal((await loginCustomer({ email: EMAIL, password: PASSWORD }, home))?.email, EMAIL, "first successful sign-in remembers the address");
    // Attack mode counts attempts per account from every address; the 31 attempts are added straight to that counter (real failures would lock the account at the fifth).
    for (let i = 0; i < 31; i++) await service.bumpCustomerCounter("login-email:" + EMAIL);
    assert.equal(await loginCustomer({ email: EMAIL, password: PASSWORD }, "203.0.113.200"), null, "an unknown address is held back during the attack, even with the right password");
    assert.equal((await loginCustomer({ email: EMAIL, password: PASSWORD }, home))?.email, EMAIL, "the customer's usual address still signs in");
    assert.equal(await loginCustomer({ email: EMAIL, password: "wrong" }, home), null, "wrong passwords from a known address are still refused");
  } finally { await wipe(); }
});

test("repeated failures from one address slow down (progressive delay)", { skip }, async () => {
  const { loginCustomer, wipe } = await setup();
  try {
    const timings: number[] = [];
    for (let i = 0; i < 5; i++) { const t = Date.now(); await loginCustomer({ email: EMAIL, password: "x" + i }, "203.0.113.90"); timings.push(Date.now() - t); }
    assert.ok(timings[4] - timings[0] > 200, `later attempts are slower (${timings.join(", ")} ms)`);
  } finally { await wipe(); }
});

test("a remembered address is stored for 30 days, expires, and is only ever created by a correct password", { skip }, async () => {
  const { db, service, loginCustomer, wipe } = await setup();
  try {
    const home = "198.51.100.31";
    assert.equal(await loginCustomer({ email: EMAIL, password: "wrong-first" }, home), null);
    assert.equal(await db.customerRateLimit.count({ where: { expiresAt: { gt: new Date(Date.now() + 20 * 86_400_000) } } }), 0, "a failed attempt never creates a remembered address");
    assert.equal((await loginCustomer({ email: EMAIL, password: PASSWORD }, home))?.email, EMAIL);
    const longLived = await db.customerRateLimit.findMany({ where: { expiresAt: { gt: new Date(Date.now() + 20 * 86_400_000) } }, select: { expiresAt: true, key: true } });
    assert.equal(longLived.length, 1, "exactly one remembered address");
    const days = (longLived[0].expiresAt.getTime() - Date.now()) / 86_400_000;
    assert.ok(days > 29.9 && days <= 30.01, `expires in 30 days (${days.toFixed(2)})`);
    assert.ok(!/198\.51\.100\.31|@example\.test/.test(longLived[0].key), "the stored key is a keyed hash, not the address or email");
    // The 30 days pass: the address is forgotten, so during an attack it is held back like any other new address.
    await db.customerRateLimit.updateMany({ where: { key: longLived[0].key }, data: { expiresAt: new Date(Date.now() - 1000) } });
    for (let i = 0; i < 31; i++) await service.bumpCustomerCounter("login-email:" + EMAIL);
    assert.equal(await loginCustomer({ email: EMAIL, password: PASSWORD }, home), null, "after expiry the address is no longer trusted during an attack");
  } finally { await wipe(); }
});
