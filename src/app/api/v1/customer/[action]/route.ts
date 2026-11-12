import { z } from "zod";
import { assertSameOrigin,readJson,RequestBodyError } from "@/server/auth/request";
import { registerCustomer,verifyCustomer,resendCode,limitCustomerRequests,CustomerError } from "@/server/customer/service";
import { verifySchema,resendSchema } from "@/features/customer/validation";
import { clientIpFromHeaders } from "@/server/client-ip";
export async function POST(request:Request,{params}:{params:Promise<{action:string}>}){
  if(!assertSameOrigin(request))return Response.json({error:"Request origin could not be verified."},{status:403});
  try{
    const {action}=await params;
    if(!["signup","verify","resend"].includes(action))return Response.json({error:"Not found."},{status:404});
    await limitCustomerRequests("customer-global:"+action,200);
    if(process.env.TRUST_PROXY_HEADERS==="true")await limitCustomerRequests("customer-network:"+action+":"+(clientIpFromHeaders(request.headers)??"unknown"),30);
    const body=await readJson(request);
    const result=action==="signup"?await registerCustomer(body):action==="verify"?await(async()=>{const v=verifySchema.parse(body);await verifyCustomer(v.challengeId,v.code);return{verified:true};})():await resendCode(resendSchema.parse(body).challengeId);
    return Response.json(result,{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    const message=error instanceof CustomerError||error instanceof RequestBodyError?error.message:error instanceof z.ZodError?error.issues[0].message:"Account service is temporarily unavailable.";
    return Response.json({error:message},{status:error instanceof CustomerError?error.status:error instanceof z.ZodError||error instanceof RequestBodyError?400:503,headers:{"Cache-Control":"no-store"}});
  }
}
