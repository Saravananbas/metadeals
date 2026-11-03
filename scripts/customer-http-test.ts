import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {readFile,unlink} from "node:fs/promises";
import path from "node:path";
import {getDatabase,disconnectDatabase} from "../src/server/db/client";
if(process.env.NODE_ENV === "production" || ![undefined,"local"].includes(process.env.CUSTOMER_EMAIL_MODE))throw new Error("Customer tests require the local outbox, never live mail.");
const base="http://localhost:4123";
const db=getDatabase(),tag=randomUUID(),email=`customer-test-${tag}@example.test`;
const password="Synthetic shopper phrase 83!";
const challengeIds:string[]=[];
const cookies=new Map<string,string>();
async function call(url:string,body?:unknown,status=200,origin=base){
  const response=await fetch(base+url,{method:body?"POST":"GET",headers:{Origin:origin,Cookie:[...cookies].map(([k,v])=>k+"="+v).join("; "),...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});
  for(const c of response.headers.getSetCookie()){const pair=c.split(";")[0],index=pair.indexOf("=");cookies.set(pair.slice(0,index),pair.slice(index+1));}
  assert.equal(response.status,status,url+" "+await response.clone().text());return response;
}
async function outbox(id:string){const item=JSON.parse(await readFile(path.join(".local/email-outbox",id+".json"),"utf8"));return item.text.match(/\b\d{6}\b/)[0] as string;}
async function main(){
try{
  const adminBefore=await db.user.count();
  const signup={name:"Synthetic Test Shopper",email,password,confirmPassword:password};
  await call("/api/v1/customer/signup",signup,403,"https://untrusted.example");
  await call("/api/v1/customer/signup",{...signup,confirmPassword:"no-match"},400);
  const registration=await(await call("/api/v1/customer/signup",signup)).json();
  challengeIds.push(registration.challengeId);assert.equal(registration.delivery,"local");
  assert.equal(await db.customer.count({where:{email}}),0);
  await call("/api/v1/customer/resend",{challengeId:registration.challengeId},429);
  const code=await outbox(registration.challengeId);
  await call("/api/v1/customer/verify",{challengeId:registration.challengeId,code:code==="000000"?"111111":"000000"},400);
  await call("/api/v1/customer/verify",{challengeId:registration.challengeId,code});
  await call("/api/v1/customer/verify",{challengeId:registration.challengeId,code},400);
  const shopper=await db.customer.findUniqueOrThrow({where:{email}});assert.ok(shopper.emailVerifiedAt);assert.notEqual(shopper.passwordHash,password);
  const csrf=await(await call("/api/auth/csrf")).json();
  async function credentials(pw:string){
    const response=await fetch(base+"/api/auth/callback/credentials",{method:"POST",headers:{Origin:base,Cookie:[...cookies].map(([k,v])=>k+"="+v).join("; "),"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({csrfToken:csrf.csrfToken,email,password:pw,json:"true",callbackUrl:base+"/account"})});
    for(const c of response.headers.getSetCookie()){const pair=c.split(";")[0],index=pair.indexOf("=");cookies.set(pair.slice(0,index),pair.slice(index+1));}return response.json();
  }
  assert.match((await credentials("Incorrect synthetic password")).url,/error=/);
  const login=await credentials(password);assert.doesNotMatch(login.url,/error=/);
  assert.equal((await(await call("/api/v1/customer/session")).json()).user.email,email);
  assert.equal((await(await call("/api/auth/session")).json()).user,null);
  await call("/api/v1/admin/deals",undefined,401);
  assert.equal(await db.user.count(),adminBefore);
  // Active customer disabled: the same cookie must no longer authorize customer reads.
  await db.customer.update({where:{id:shopper.id},data:{disabledAt:new Date()}});
  assert.equal((await(await call("/api/v1/customer/session")).json()).user,null);
  await db.customer.update({where:{id:shopper.id},data:{disabledAt:null}});
  const logoutCsrf=await(await call("/api/auth/csrf")).json();
  const logout=await fetch(base+"/api/auth/signout",{method:"POST",headers:{Cookie:[...cookies].map(([k,v])=>k+"="+v).join("; "),"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({csrfToken:logoutCsrf.csrfToken,json:"true",callbackUrl:base+"/account"})});
  for(const c of logout.headers.getSetCookie()){const pair=c.split(";")[0],i=pair.indexOf("=");cookies.set(pair.slice(0,i),pair.slice(i+1));}
  assert.equal((await(await call("/api/v1/customer/session")).json()).user,null);
  const signup2={...signup,email:`expiry-${tag}@example.test`};
  const second=await(await call("/api/v1/customer/signup",signup2)).json();challengeIds.push(second.challengeId);
  await db.customerSignupChallenge.update({where:{id:second.challengeId},data:{expiresAt:new Date(0)}});
  await call("/api/v1/customer/verify",{challengeId:second.challengeId,code:await outbox(second.challengeId)},400);
  await db.customerSignupChallenge.update({where:{id:second.challengeId},data:{expiresAt:new Date(Date.now()+600000)}});
  const secondCode=await outbox(second.challengeId),wrong=secondCode==="000000"?"111111":"000000";
  for(let i=0;i<5;i++)await call("/api/v1/customer/verify",{challengeId:second.challengeId,code:wrong},400);
  await call("/api/v1/customer/verify",{challengeId:second.challengeId,code:secondCode},400);
  const ids:string[]=[];let cursor:string|undefined;
  do {const page=await(await call("/api/v1/home-deals?limit=12"+(cursor?"&cursor="+cursor:""))).json();assert.equal(page.source,"demo");ids.push(...page.data.map((d:{id:string})=>d.id));cursor=page.nextCursor;}while(cursor);
  assert.equal(new Set(ids).size,50);assert.equal(ids.length,50);
  console.log("PASS: signup, OTP failure/success/replay/expiry/exhaustion, cooldown, login, disabled account, admin isolation and 50 paginated samples.");
}finally{
  await db.customerSignupChallenge.deleteMany({where:{id:{in:challengeIds}}});
  await db.customer.deleteMany({where:{email}});
  for(const id of challengeIds)await unlink(path.join(".local/email-outbox",id+".json")).catch(()=>{});
  await disconnectDatabase();
}

}
void main().catch(error=>{console.error(error);process.exitCode=1;});
