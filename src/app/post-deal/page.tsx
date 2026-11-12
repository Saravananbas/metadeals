import Link from "next/link";
import { getServerSession } from "next-auth";
import { CustomerProfile } from "@/features/customer/CustomerProfile";
import { getCustomerAuthOptions } from "@/server/customer/options";

export const dynamic = "force-dynamic";
export const metadata = { title: "Post a Deal | MetaDeals4U", robots: { index: false, follow: false } };

export default async function PostDealPage() {
  const signedIn = Boolean((await getServerSession(getCustomerAuthOptions()))?.user);
  if (signedIn) return <main style={{ padding: "24px 0" }}><CustomerProfile section="deals" /></main>;
  return (
    <main style={{ maxWidth: 520, margin: "80px auto", padding: 16, textAlign: "center" }}>
      <h1>Post a Deal</h1>
      <p>Please sign in to share a deal. Our team checks every deal before it appears.</p>
      <p><Link href="/account">Sign in or create an account</Link></p>
    </main>
  );
}
