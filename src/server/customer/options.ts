import "server-only";
import type { NextAuthOptions } from "next-auth";
import type { Provider } from "next-auth/providers/index";
import Google from "next-auth/providers/google";
import Apple from "next-auth/providers/apple";
import Credentials from "next-auth/providers/credentials";
import { getAuthEnv } from "@/config/env";
import { getDatabase } from "@/server/db/client";
import { hashOpaqueToken } from "@/server/auth/crypto";
import { verifiedProviderEmail } from "@/features/customer/validation";
import { loginCustomer } from "./service";
export function customerProviders() {
  return {google:Boolean(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET),
    apple:Boolean(process.env.NEXTAUTH_URL?.startsWith("https://")&&process.env.APPLE_CLIENT_ID&&process.env.APPLE_CLIENT_SECRET)};
}
export function getCustomerAuthOptions():NextAuthOptions {
  const env=getAuthEnv(),enabled=customerProviders(),secure=env.NEXTAUTH_URL.startsWith("https://");
  const providers:Provider[]=[Credentials({name:"Email and password",credentials:{email:{type:"email"},password:{type:"password"}},
    async authorize(credentials){try{return await loginCustomer(credentials);}catch{return null;}}})];
  if(enabled.google)providers.push(Google({clientId:process.env.GOOGLE_CLIENT_ID!,clientSecret:process.env.GOOGLE_CLIENT_SECRET!}));
  if(enabled.apple)providers.push(Apple({clientId:process.env.APPLE_CLIENT_ID!,clientSecret:process.env.APPLE_CLIENT_SECRET!,checks:["pkce","state"]}));
  const checkCookie=(suffix:string)=>({name:(secure?"__Secure-":"")+"md-customer-"+suffix,options:{httpOnly:true,sameSite:secure?"none" as const:"lax" as const,path:"/",secure,maxAge:900}});
  return {providers,secret:hashOpaqueToken("customer-nextauth",env.NEXTAUTH_SECRET),session:{strategy:"jwt",maxAge:86400},
    pages:{signIn:"/account",error:"/account"},
    cookies:{sessionToken:{name:(secure?"__Secure-":"")+"md-customer-session",options:{httpOnly:true,sameSite:"lax",path:"/",secure}},
      state:checkCookie("state"),pkceCodeVerifier:checkCookie("pkce"),nonce:checkCookie("nonce")},
    callbacks:{
      async signIn({user,account,profile}){
        if(account?.provider==="credentials")return true;
        if(!account||!["google","apple"].includes(account.provider)||!profile||!verifiedProviderEmail(profile))return false;
        const email=user.email?.trim().toLowerCase();if(!email)return false;
        try{
          const customer=await getDatabase().$transaction(async tx=>{
            const identity=await tx.customerIdentity.findUnique({where:{provider_subject:{provider:account.provider,subject:account.providerAccountId}},include:{customer:true}});
            if(identity)return identity.customer;
            if(await tx.customer.findUnique({where:{email}}))return null;
            return tx.customer.create({data:{email,name:user.name?.slice(0,80)||"MetaDeals4U shopper",emailVerifiedAt:new Date(),
              identities:{create:{provider:account.provider,subject:account.providerAccountId}}}});
          });
          if(!customer||customer.disabledAt)return false;user.id=customer.id;return true;
        }catch{return false;}
      },
      async jwt({token,user}){if(user)token.customerId=user.id;return token;},
      async session({session,token}){
        const customer=typeof token.customerId==="string"?await getDatabase().customer.findUnique({where:{id:token.customerId},select:{name:true,email:true,disabledAt:true}}):null;
        session.user=customer&&!customer.disabledAt?{name:customer.name,email:customer.email}:undefined;return session;
      },
      async redirect({url,baseUrl}){const origin=new URL(baseUrl).origin;try{const dest=new URL(url,origin);return dest.origin===origin?dest.href:origin+"/account";}catch{return origin+"/account";}}
    },logger:{error(){console.error("Customer authentication failed.");},warn(){},debug(){}}
  };
}
