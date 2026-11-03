import { getServerSession } from "next-auth";
import { getCustomerAuthOptions } from "@/server/customer/options";
export async function GET(){const session=await getServerSession(getCustomerAuthOptions());return Response.json({user:session?.user??null},{headers:{"Cache-Control":"no-store"}});}
