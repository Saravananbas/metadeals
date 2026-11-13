import NextAuth from "next-auth";
import type { NextRequest } from "next/server";
import { getCustomerAuthOptions } from "@/server/customer/options";
// Existing static admin /login, /logout and /session routes retain precedence.
// Customers read /api/v1/customer/session, never the admin session endpoint.
type Context={params:Promise<{nextauth:string[]}>};
async function handler(request:NextRequest,context:Context){
  // Sign-in limits live in loginCustomer (per address and per email+address); a global counter here would let anyone block everyone.
  return NextAuth(getCustomerAuthOptions())(request,context);
}
export {handler as GET,handler as POST};
