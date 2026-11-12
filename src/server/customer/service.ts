import "server-only";
import { randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { getDatabase } from "@/server/db/client";
import { getAuthEnv } from "@/config/env";
import { hashPassword, verifyPassword, validatePassword, hashOpaqueToken } from "@/server/auth/crypto";
import { signupSchema, loginSchema } from "@/features/customer/validation";
import { emailMode, sendSignupCode } from "./email";

export class CustomerError extends Error { constructor(message: string, public status = 400) { super(message); } }
const digest = (value: string) => hashOpaqueToken("customer:" + value, getAuthEnv().AUTH_SESSION_SECRET);
const dummyHash = hashPassword(randomUUID());
export async function limitCustomerRequests(subject: string, maximum: number, seconds = 900) {
  const db = getDatabase(), now = new Date(), expiresAt = new Date(Date.now() + seconds * 1000);
  const key = digest(subject);
  // Portable (PostgreSQL and MariaDB): atomic increment while the window is open, otherwise start a new window.
  const attempt = () => db.$transaction(async (tx) => {
    const open = await tx.customerRateLimit.updateMany({ where: { key, expiresAt: { gt: now } }, data: { count: { increment: 1 } } });
    if (open.count === 0) {
      await tx.customerRateLimit.upsert({ where: { key }, create: { key, count: 1, expiresAt }, update: { count: 1, expiresAt } });
      return 1;
    }
    return (await tx.customerRateLimit.findUniqueOrThrow({ where: { key }, select: { count: true } })).count;
  });
  // Parallel requests from one person hit the same counter row; retry the harmless conflicts (unique race, deadlock, MariaDB "record changed" 1020).
  let count = 0;
  for (let tries = 1; ; tries++) {
    try { count = await attempt(); break; }
    catch (error) {
      const text = error instanceof Error ? error.message : "";
      const code = (error as { code?: string })?.code ?? "";
      if (tries >= 6 || !(["P2002", "P2034", "P2025"].includes(code) || /1020|Record has changed since last read|deadlock|40001|could not serialize/i.test(text))) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10 * tries + Math.floor(Math.random() * 20)));
    }
  }
  if (count > maximum) throw new CustomerError("Too many attempts. Please try again later.", 429);
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
export async function loginCustomer(raw:unknown) {
  const input=loginSchema.safeParse(raw);if(!input.success)return null;
  await limitCustomerRequests("login:"+input.data.email,10);
  const customer=await getDatabase().customer.findUnique({where:{email:input.data.email}});
  const valid=await verifyPassword(customer?.passwordHash ?? await dummyHash,input.data.password);
  if(!customer || customer.disabledAt || !valid || !customer.passwordHash)return null;
  return {id:customer.id,name:customer.name,email:customer.email};
}
