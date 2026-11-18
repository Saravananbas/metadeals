import { redirect } from "next/navigation";
import { getCurrentAuthContext } from "@/server/auth/session";
import { can } from "@/server/auth/permissions";
import { firstAllowedPath } from "@/server/auth/modules";
import { getDatabase } from "@/server/db/client";
import { CategoriesManager } from "@/features/categories/components/CategoriesManager";

export const metadata = {
  title: "Categories Taxonomy | MetaDeals4U Admin",
  description: "Curated category and subcategory taxonomy tree for MetaDeals4U deal aggregation.",
};

export default async function CategoriesAdminPage() {
  const context = await getCurrentAuthContext();
  if (!context) redirect("/admin/login");
  if (!can(context.user, "deal:edit") && !can(context.user, "category:manage")) redirect(firstAllowedPath(context.user));

  const db = getDatabase();
  const categories = await db.category.findMany({
    take: 500,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      parentId: true,
    },
  });

  return <CategoriesManager role={context.user.role} permissions={context.user.permissions} initialCategories={categories} />;
}

