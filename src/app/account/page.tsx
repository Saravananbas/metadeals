import { CustomerAccount } from "@/features/customer/CustomerAccount";
import { customerProviders } from "@/server/customer/options";
import { emailMode } from "@/server/customer/email";
export const dynamic="force-dynamic";
export const metadata={title:"Your account | MetaDeals4U",robots:{index:false,follow:false}};
export default async function AccountPage({searchParams}:{searchParams:Promise<{error?:string}>}){const {error}=await searchParams;return <CustomerAccount providers={customerProviders()} delivery={emailMode()} oauthError={Boolean(error)}/>;}
