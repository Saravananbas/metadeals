import { redirect } from "next/navigation";
import { getCurrentAuthContext } from "@/server/auth/session";
import { getDatabase } from "@/server/db/client";
import { CategoriesManager } from "@/features/categories/components/CategoriesManager";

export const metadata = {
  title: "Categories Taxonomy | MetaDeals4U Admin",
  description: "Curated category and subcategory taxonomy tree for MetaDeals4U deal aggregation.",
};

export default async function CategoriesAdminPage() {
  const context = await getCurrentAuthContext();
  if (!context) redirect("/admin/login");

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

  return <CategoriesManager role={context.user.role} initialCategories={categories} />;
}

