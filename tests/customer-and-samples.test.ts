import test from "node:test";
import assert from "node:assert/strict";
import {signupSchema,verifySchema,verifiedProviderEmail} from "../src/features/customer/validation";
import {sampleDeals,listSampleDeals} from "../src/features/deals/sample-catalog";
import {listingSchema} from "../src/features/deals/validation";
test("sample catalog pages contain exactly 50 unique labelled offers",()=>{
  const ids:string[]=[];let cursor:string|undefined;
  do{const page=listSampleDeals(listingSchema.parse({limit:12,cursor}));assert.ok(page.data.length<=12);ids.push(...page.data.map(d=>d.id));cursor=page.nextCursor??undefined;}while(cursor);
  assert.equal(ids.length,50);assert.equal(new Set(ids).size,50);
  assert.ok(sampleDeals.every(d=>d.source==="demo"&&d.rating===null&&d.price<=d.originalPrice));
  const filtered=listSampleDeals(listingSchema.parse({q:"Sony",limit:12}));
  assert.ok(filtered.data.length>0&&filtered.data.every(d=>d.brand==="Sony"));
  assert.equal(listSampleDeals(listingSchema.parse({q:"no-such-product"})).data.length,0);
});
test("customer signup validates confirmation, normalized email and six-digit OTP",()=>{
  const data={name:"Test Shopper",email:" Person@Example.com ",password:"Long unique phrase 42!",confirmPassword:"Long unique phrase 42!"};
  assert.equal(signupSchema.parse(data).email,"person@example.com");
  assert.equal(signupSchema.safeParse({...data,confirmPassword:"different"}).success,false);
  assert.equal(signupSchema.safeParse({...data,role:"ADMIN"}).success,false);
  assert.equal(verifySchema.safeParse({challengeId:"bad",code:"123456"}).success,false);
});
test("OAuth email must be explicitly verified, never merely present",()=>{
  assert.equal(verifiedProviderEmail({email:"a@example.com"}),false);
  assert.equal(verifiedProviderEmail({email:"a@example.com",email_verified:"false"}),false);
  assert.equal(verifiedProviderEmail({email:"a@example.com",email_verified:true}),true);
  assert.equal(verifiedProviderEmail({email:"a@example.com",email_verified:"true"}),true);
});
