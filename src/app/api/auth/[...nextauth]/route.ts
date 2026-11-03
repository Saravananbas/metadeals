import NextAuth from "next-auth";
import type { NextRequest } from "next/server";
import { getCustomerAuthOptions } from "@/server/customer/options";
import { limitCustomerRequests } from "@/server/customer/service";
// Existing static admin /login, /logout and /session routes retain precedence.
// Customers read /api/v1/customer/session, never the admin session endpoint.
type Context={params:Promise<{nextauth:string[]}>};
async function handler(request:NextRequest,context:Context){
  const {nextauth}=await context.params;
  if(request.method==="POST"&&nextauth[0]==="callback"&&nextauth[1]==="credentials"){
    try{await limitCustomerRequests("login-global",200);}catch{return Response.json({error:"Too many attempts."},{status:429});}
  }
  return NextAuth(getCustomerAuthOptions())(request,context);
}
export {handler as GET,handler as POST};
