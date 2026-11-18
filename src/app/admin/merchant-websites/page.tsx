import { redirect } from "next/navigation";
import { getCurrentAuthContext } from "@/server/auth/session";
import { can } from "@/server/auth/permissions";
import { firstAllowedPath } from "@/server/auth/modules";
import { MerchantWebsiteDirectoryManager } from "@/features/merchants/components/MerchantWebsiteDirectoryManager";

export const metadata = {
  title: "Merchant Website Directory | MetaDeals4U Admin",
  description: "Curated directory of merchant websites, domains, and categories for Indian deals and coupons.",
};

export default async function MerchantWebsitesPage() {
  const context = await getCurrentAuthContext();
  if (!context) redirect("/admin/login");
  if (!can(context.user, "deal:edit") && !can(context.user, "merchant:manage")) redirect(firstAllowedPath(context.user));

  return <MerchantWebsiteDirectoryManager />;
}

