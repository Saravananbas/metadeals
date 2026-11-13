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
const PASSWORD = "Correct-Horse-Battery-9!";

async function setup() {
  const { getDatabase } = await import("../src/server/db/client");
  const { loginCustomer } = await import("../src/server/customer/service");
  const { hashPassword } = await import("../src/server/auth/crypto");
  const db = getDatabase();
  await db.customerRateLimit.deleteMany({});
  await db.customer.deleteMany({ where: { email: EMAIL } });
  await db.customer.create({ data: { name: "Victim", email: EMAIL, passwordHash: await hashPassword(PASSWORD), emailVerifiedAt: new Date() } });
  return { db, loginCustomer };
}

test("an attacker's failed guesses do not lock the real customer out", { skip }, async () => {
  const { db, loginCustomer } = await setup();
  try {
    for (let i = 0; i < 9; i++) assert.equal(await loginCustomer({ email: EMAIL, password: "wrong-" + i }, "203.0.113.50"), null);
    assert.equal(await loginCustomer({ email: EMAIL, password: PASSWORD }, "203.0.113.50"), null, "the attacker's own address is now blocked, even with the right password");
    const real = await loginCustomer({ email: EMAIL, password: PASSWORD }, "198.51.100.7");
    assert.equal(real?.email, EMAIL, "the real customer from another address still signs in");
  } finally { await db.customerRateLimit.deleteMany({}); await db.customer.deleteMany({ where: { email: EMAIL } }); }
});

test("one address flooding sign-in is stopped without affecting others", { skip }, async () => {
  const { db, loginCustomer } = await setup();
  try {
    for (let i = 0; i < 61; i++) await loginCustomer({ email: `nobody${i % 5}@example.test`, password: "x" + i }, "203.0.113.60");
    assert.equal(await loginCustomer({ email: EMAIL, password: PASSWORD }, "203.0.113.60"), null, "flooding address is blocked");
    assert.equal((await loginCustomer({ email: EMAIL, password: PASSWORD }, "198.51.100.8"))?.email, EMAIL, "other addresses are fine");
  } finally { await db.customerRateLimit.deleteMany({}); await db.customer.deleteMany({ where: { email: EMAIL } }); }
});

test("unknown email and wrong password look the same", { skip }, async () => {
  const { db, loginCustomer } = await setup();
  try {
    assert.equal(await loginCustomer({ email: "ghost@example.test", password: "whatever-123" }, "198.51.100.9"), null);
    assert.equal(await loginCustomer({ email: EMAIL, password: "wrong-password-123" }, "198.51.100.9"), null);
  } finally { await db.customerRateLimit.deleteMany({}); await db.customer.deleteMany({ where: { email: EMAIL } }); }
});

test("one address cannot push the victim's overall counter past what it is allowed to add", { skip }, async () => {
  const { db, loginCustomer } = await setup();
  try {
    for (let i = 0; i < 60; i++) await loginCustomer({ email: EMAIL, password: "guess-" + i }, "203.0.113.70");
    const real = await loginCustomer({ email: EMAIL, password: PASSWORD }, "198.51.100.11");
    assert.equal(real?.email, EMAIL, "the real customer still signs in after 60 attempts from one address");
  } finally { await db.customerRateLimit.deleteMany({}); await db.customer.deleteMany({ where: { email: EMAIL } }); }
});

test("distributed attack: the customer's usual address keeps working, a new address waits, attackers get nowhere", { skip }, async () => {
  const { db, loginCustomer } = await setup();
  try {
    const home = "198.51.100.21";
    assert.equal((await loginCustomer({ email: EMAIL, password: PASSWORD }, home))?.email, EMAIL, "first successful sign-in remembers the address");
    for (let i = 0; i < 40; i++) assert.equal(await loginCustomer({ email: EMAIL, password: "botnet-" + i }, `203.0.113.${100 + i}`), null);
    assert.equal(await loginCustomer({ email: EMAIL, password: PASSWORD }, "203.0.113.200"), null, "an unknown address is held back during the attack, even with the right password");
    assert.equal((await loginCustomer({ email: EMAIL, password: PASSWORD }, home))?.email, EMAIL, "the customer's usual address still signs in");
    assert.equal(await loginCustomer({ email: EMAIL, password: "wrong" }, home), null, "wrong passwords from a known address are still refused");
  } finally { await db.customerRateLimit.deleteMany({}); await db.customer.deleteMany({ where: { email: EMAIL } }); }
});

test("repeated failures from one address slow down (progressive delay)", { skip }, async () => {
  const { db, loginCustomer } = await setup();
  try {
    const timings: number[] = [];
    for (let i = 0; i < 6; i++) { const t = Date.now(); await loginCustomer({ email: EMAIL, password: "x" + i }, "203.0.113.90"); timings.push(Date.now() - t); }
    assert.ok(timings[5] - timings[0] > 300, `later attempts are slower (${timings.join(", ")} ms)`);
  } finally { await db.customerRateLimit.deleteMany({}); await db.customer.deleteMany({ where: { email: EMAIL } }); }
});
