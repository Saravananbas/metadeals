import "server-only";
import { randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { getDatabase } from "@/server/db/client";
import { getAuthEnv } from "@/config/env";
import { hashPassword, verifyPassword, validatePassword, hashOpaqueToken } from "@/server/auth/crypto";
import { signupSchema, loginSchema, emailSchema, forgotSchema, resetSchema } from "@/features/customer/validation";
import { emailMode, sendSignupCode, sendResetCode } from "./email";
import { addressBucket } from "@/server/client-ip";
import { logger } from "@/server/logging/logger";

export class CustomerError extends Error { constructor(message: string, public status = 400) { super(message); } }
const digest = (value: string) => hashOpaqueToken("customer:" + value, getAuthEnv().AUTH_SESSION_SECRET);
const dummyHash = hashPassword(randomUUID());
/** Counts one event in a rolling window and returns the new count. Portable (PostgreSQL and MariaDB): atomic increment while the window is open, otherwise start a new window. */
export async function bumpCustomerCounter(subject: string, seconds = 900): Promise<number> {
  const db = getDatabase(), now = new Date(), expiresAt = new Date(Date.now() + seconds * 1000);
  const key = digest(subject);
  const attempt = () => db.$transaction(async (tx) => {
    const open = await tx.customerRateLimit.updateMany({ where: { key, expiresAt: { gt: now } }, data: { count: { increment: 1 } } });
    if (open.count === 0) {
      await tx.customerRateLimit.upsert({ where: { key }, create: { key, count: 1, expiresAt }, update: { count: 1, expiresAt } });
      return 1;
    }
    return (await tx.customerRateLimit.findUniqueOrThrow({ where: { key }, select: { count: true } })).count;
  });
  // Parallel requests from one person hit the same counter row; retry the harmless conflicts (unique race, deadlock, MariaDB "record changed" 1020).
  // Expired counters are removed now and then so the table does not grow without limit.
  if (Math.random() < 0.02) void db.customerRateLimit.deleteMany({ where: { expiresAt: { lt: now } } }).catch(() => {});
  for (let tries = 1; ; tries++) {
    try { return await attempt(); }
    catch (error) {
      const text = error instanceof Error ? error.message : "";
      const code = (error as { code?: string })?.code ?? "";
      if (tries >= 6 || !(["P2002", "P2034", "P2025"].includes(code) || /1020|Record has changed since last read|deadlock|40001|could not serialize/i.test(text))) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10 * tries + Math.floor(Math.random() * 20)));
    }
  }
}
export async function limitCustomerRequests(subject: string, maximum: number, seconds = 900) {
  if ((await bumpCustomerCounter(subject, seconds)) > maximum) throw new CustomerError("Too many attempts. Please try again later.", 429);
}
export async function registerCustomer(raw: unknown) {
  const input = signupSchema.parse(raw);
  const policy = validatePassword(input.password, input.email);
  if (policy) throw new CustomerError(policy);
  if (emailMode() === "unavailable") throw new CustomerError("Email verification is not configured yet.", 503);
  await limitCustomerRequests("signup:" + input.email, 5);
  const db = getDatabase(), id = randomUUID();
  const passwordHash = await hashPassword(input.password);
  // Same response for existing accounts; never replace a registered password.
  if (await db.customer.findUnique({ where: { email: input.email }, select: { id: true } })) return { challengeId: id, delivery: emailMode() };
  const previous = await db.customerSignupChallenge.findUnique({ where: { email: input.email } });
  if (previous && previous.createdAt.getTime() > Date.now() - 60_000) throw new CustomerError("Please wait a minute before requesting another code.", 429);
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.customerSignupChallenge.upsert({ where: { email: input.email },
    create: { id, email: input.email, name: input.name, passwordHash, codeHash: digest(id + ":" + code), expiresAt: new Date(Date.now()+600_000) },
    update: { id, name: input.name, passwordHash, codeHash: digest(id + ":" + code), attempts: 0, expiresAt: new Date(Date.now()+600_000), createdAt: new Date(), consumedAt: null } });
  try { await sendSignupCode(input.email, code, id); }
  catch { await db.customerSignupChallenge.updateMany({where:{id},data:{expiresAt:new Date(0)}}); throw new CustomerError("We could not deliver your code. Please retry in a minute.",503); }
  return { challengeId: id, delivery: emailMode() };
}
export async function resendCode(id: string) {
  const db=getDatabase();
  await limitCustomerRequests("resend:"+id,5);
  const row=await db.customerSignupChallenge.findUnique({where:{id}});
  if(!row || row.consumedAt) return {challengeId:id,delivery:emailMode()};
  const code=String(randomInt(0,1_000_000)).padStart(6,"0");
  const changed=await db.customerSignupChallenge.updateMany({where:{id,consumedAt:null,createdAt:{lte:new Date(Date.now()-60_000)}},
    data:{codeHash:digest(id+":"+code),attempts:0,createdAt:new Date(),expiresAt:new Date(Date.now()+600_000)}});
  if(!changed.count)throw new CustomerError("Please wait a minute before requesting another code.",429);
  try { await sendSignupCode(row.email,code,id); } catch { await db.customerSignupChallenge.updateMany({where:{id},data:{expiresAt:new Date(0)}}); throw new CustomerError("Code delivery failed. Please retry in a minute.",503); }
  return {challengeId:id,delivery:emailMode()};
}
export async function verifyCustomer(id: string, code: string) {
  const db=getDatabase();
  const attempted=await db.customerSignupChallenge.updateMany({where:{id,consumedAt:null,expiresAt:{gt:new Date()},attempts:{lt:5}},data:{attempts:{increment:1}}});
  if(!attempted.count)throw new CustomerError("Code expired or attempts exhausted. Request a new code.");
  const row=await db.customerSignupChallenge.findUniqueOrThrow({where:{id}});
  if(!timingSafeEqual(Buffer.from(row.codeHash),Buffer.from(digest(id+":"+code))))throw new CustomerError("Incorrect verification code.");
  return db.$transaction(async tx=>{
    const claimed=await tx.customerSignupChallenge.updateMany({where:{id,codeHash:row.codeHash,consumedAt:null,expiresAt:{gt:new Date()},attempts:{lte:5}},data:{consumedAt:new Date()}});
    if(!claimed.count)throw new CustomerError("This code is no longer valid.");
    if(await tx.customer.findUnique({where:{email:row.email}}))throw new CustomerError("Please sign in with your existing account.");
    const customer=await tx.customer.create({data:{name:row.name,email:row.email,passwordHash:row.passwordHash,emailVerifiedAt:new Date()}});
    // No password hash remains in the consumed challenge.
    await tx.customerSignupChallenge.delete({where:{id}});
    return {id:customer.id};
  });
}
/**
 * Password sign-in. Design goals: slow guessing down, never let a stranger lock the real customer out, reveal nothing about which emails exist.
 * - Per address (an IPv6 /64 is one address): total attempts. A flood from one address stops; other addresses are unaffected.
 * - Per email AND address: counted BEFORE the password is checked (a parallel burst cannot slip past), cleared on a correct password, and each failure after the third adds a growing delay.
 * - Per email overall: "attack mode" when attempts for one email arrive from many addresses (more than 30 in 15 minutes). In attack mode only addresses that this customer has
 *   successfully signed in from in the last 30 days are still tried, so the customer's usual phone or computer keeps working while a distributed attacker is shut out.
 *   Residual risk: during an attack the customer cannot sign in from a NEW device until it ends (an emailed one-time code would fix that: see docs/security, needs approval).
 * - A blocked attempt gets the same "invalid" answer as a wrong password, so nothing reveals whether the account exists. Attack mode and success-after-failures are logged.
 */
export async function loginCustomer(raw:unknown, address?: string | null) {
  const input=loginSchema.safeParse(raw);if(!input.success)return null;
  const where = addressBucket(address ?? null) ?? "unknown";
  const resolved = await resolveIdentifier(input.data.email);
  if (!resolved) return null;
  // Counters use one key per account however it was typed (email or user name), so switching between them does not reset the limits.
  const email = resolved.key;
  if ((await bumpCustomerCounter("login-ip:" + where)) > (address ? 60 : 600)) return null;
  const pairKey = `login-pair:${email}:${where}`, emailKey = "login-email:" + email, knownKey = `login-known:${email}:${where}`;
  // Pair first: once one address is over its limit it stops adding to the victim's overall counter (one address can add at most 8 to it).
  const pairCount = await bumpCustomerCounter(pairKey);
  if (pairCount > 8) return null;
  const emailCount = await bumpCustomerCounter(emailKey);
  const known = await hasCustomerCounter(knownKey);
  if (emailCount > 30 && !known) {
    if (emailCount === 31) logger.warn({ event: "customer.login.attack_mode", target: digest(email).slice(0, 12), attemptsInWindow: emailCount }, "many sign-in attempts for one account from different addresses");
    return null;
  }
  // Progressive delay: the 4th failed try from one address waits 0.2 s, then 0.4, 0.8 and 1.5 s (capped).
  if (pairCount > 3) await new Promise((resolve) => setTimeout(resolve, Math.min(100 * 2 ** (pairCount - 3), 1500)));
  const customer=resolved.email ? await getDatabase().customer.findUnique({where:{email:resolved.email}}) : null;
  const valid=await verifyPassword(customer?.passwordHash ?? await dummyHash,input.data.password);
  if(!customer || customer.disabledAt || !valid || !customer.passwordHash)return null;
  if (emailCount > 10 && !known) logger.warn({ event: "customer.login.success_after_failures", target: digest(email).slice(0, 12), attemptsInWindow: emailCount }, "sign-in from a new address after many failed attempts");
  await Promise.all([clearCustomerCounter(pairKey), clearCustomerCounter(emailKey)]);
  await clearCustomerCounter(knownKey);
  await bumpCustomerCounter(knownKey, 30 * 86_400); // remember this address for 30 days
  return {id:customer.id,name:customer.name,email:customer.email,remember:["1","true","on"].includes(String(input.data.remember))};
}

/** An email address, or a community user name (looked up to its account). Unknown names behave exactly like unknown emails. */
async function resolveIdentifier(identifier: string): Promise<{ key: string; email: string | null } | null> {
  if (identifier.includes("@")) return emailSchema.safeParse(identifier).success ? { key: identifier, email: identifier } : null;
  if (!/^[a-z0-9_]{3,30}$/.test(identifier)) return null;
  const profile = await getDatabase().forumProfile.findUnique({ where: { handle: identifier }, select: { customer: { select: { email: true } } } });
  return { key: profile?.customer.email ?? "u:" + identifier, email: profile?.customer.email ?? null };
}

/**
 * Forgot password. Always answers the same way (a challenge id) whether or not the account exists, so it cannot be used to find out who has an account.
 * A six-digit code is emailed for 10 minutes and 5 tries; asking again is limited per account (3 an hour) and per address.
 */
export async function requestPasswordReset(raw: unknown) {
  const { email: identifier } = forgotSchema.parse(raw);
  const challengeId = randomUUID();
  // Checked first so the answer never depends on whether the account exists.
  if (emailMode() === "unavailable") throw new CustomerError("Email is not configured yet, so passwords cannot be reset right now.", 503);
  const resolved = await resolveIdentifier(identifier);
  if (!resolved?.email) return { challengeId, delivery: emailMode() };
  if ((await bumpCustomerCounter("reset-ask:" + resolved.email, 3600)) > 3) return { challengeId, delivery: emailMode() };
  const db = getDatabase();
  const customer = await db.customer.findUnique({ where: { email: resolved.email }, select: { id: true, disabledAt: true } });
  if (!customer || customer.disabledAt) return { challengeId, delivery: emailMode() };
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.customerPasswordReset.deleteMany({ where: { customerId: customer.id } });
  await db.customerPasswordReset.create({ data: { id: challengeId, customerId: customer.id, codeHash: digest(challengeId + ":" + code), expiresAt: new Date(Date.now() + 600_000) } });
  try { await sendResetCode(resolved.email, code, challengeId); }
  catch { await db.customerPasswordReset.deleteMany({ where: { id: challengeId } }); logger.warn({ event: "customer.reset.email_failed" }, "password reset email could not be sent"); }
  return { challengeId, delivery: emailMode() };
}

export async function confirmPasswordReset(raw: unknown) {
  const input = resetSchema.parse(raw);
  const policy = validatePassword(input.password, "");
  if (policy) throw new CustomerError(policy);
  const db = getDatabase();
  const attempted = await db.customerPasswordReset.updateMany({ where: { id: input.challengeId, consumedAt: null, expiresAt: { gt: new Date() }, attempts: { lt: 5 } }, data: { attempts: { increment: 1 } } });
  if (!attempted.count) throw new CustomerError("Code expired or attempts exhausted. Ask for a new code.");
  const row = await db.customerPasswordReset.findUniqueOrThrow({ where: { id: input.challengeId } });
  if (!timingSafeEqual(Buffer.from(row.codeHash), Buffer.from(digest(input.challengeId + ":" + input.code)))) throw new CustomerError("Incorrect code.");
  const passwordHash = await hashPassword(input.password);
  const owner = await db.$transaction(async (tx) => {
    const claimed = await tx.customerPasswordReset.updateMany({ where: { id: row.id, consumedAt: null, expiresAt: { gt: new Date() } }, data: { consumedAt: new Date() } });
    if (!claimed.count) throw new CustomerError("This code is no longer valid.");
    const current = await tx.customer.findUniqueOrThrow({ where: { id: row.customerId }, select: { email: true, emailVerifiedAt: true } });
    // Receiving the code proves the email address, so a Google-only account can also set a password this way.
    await tx.customer.update({ where: { id: row.customerId }, data: { passwordHash, emailVerifiedAt: current.emailVerifiedAt ?? new Date() } });
    // A new password ends every native-app sign-in.
    await tx.customerAppToken.updateMany({ where: { customerId: row.customerId, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.customerPasswordReset.deleteMany({ where: { customerId: row.customerId } });
    return current.email;
  });
  // The lockout counter for this account is cleared so the owner can sign in straight away with the new password.
  await clearCustomerCounter("login-email:" + owner);
  logger.info({ event: "customer.password.reset" }, "customer password reset");
  return { reset: true };
}
/** True when a counter row exists and has not expired. */
export async function hasCustomerCounter(subject: string): Promise<boolean> {
  const row = await getDatabase().customerRateLimit.findUnique({ where: { key: digest(subject) }, select: { expiresAt: true } });
  return Boolean(row && row.expiresAt > new Date());
}
/** Forgets a counter (used after a correct password). */
export async function clearCustomerCounter(subject: string) {
  await getDatabase().customerRateLimit.deleteMany({ where: { key: digest(subject) } });
}
