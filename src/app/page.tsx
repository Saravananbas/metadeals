import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import { serializeJsonLd } from "@/lib/json-ld";
import { Homepage } from "@/features/home/Homepage";
import { getHomepageDeals } from "@/features/deals/service";
import { getDatabase } from "@/server/db/client";

export const dynamic = "force-dynamic";

// Public data is the same for every visitor, so the database is asked at most once every 30 seconds.
// shortcut: no instant clearing on publish; a new deal shows within 30 s. Add a tag and revalidateTag in the admin route if that is too slow.
const getHomeData = unstable_cache(async (page: number) => {
  const db = getDatabase();
  const [{ deals, totalPages }, categories, merchants] = await Promise.all([
    getHomepageDeals(page),
    db.category.findMany({ orderBy: { name: "asc" }, select: { id: true, slug: true, name: true, parentId: true } }),
    db.merchant.findMany({ take: 60, orderBy: { name: "asc" }, select: { id: true, slug: true, name: true } }),
  ]);
  return { deals, totalPages: totalPages ?? 1, categories, merchants };
}, ["home-data"], { revalidate: 30, tags: ["public-deals"] });

const pageOf = (raw?: string) => { const n = Number(raw); return Number.isInteger(n) && n >= 1 && n <= 1000 ? n : 1; };

// Filtered views (/?category=...) all point back to the one homepage address; later pages of the list have their own address.
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ page?: string }> }): Promise<Metadata> {
  const page = pageOf((await searchParams).page);
  return { alternates: { canonical: page > 1 ? `/?page=${page}` : "/" } };
}

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://metadeals4u.in";
const siteJsonLd = [
  { "@context": "https://schema.org", "@type": "WebSite", name: "MetaDeals4U", url: baseUrl },
  { "@context": "https://schema.org", "@type": "Organization", name: "MetaDeals4U", url: baseUrl },
];

export default async function Home({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = pageOf((await searchParams).page);
  const { deals, totalPages, categories, merchants } = await getHomeData(page);
  if (page > totalPages) redirect(totalPages > 1 ? `/?page=${totalPages}` : "/");
  return (
    <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(siteJsonLd) }} />
    <Homepage
      deals={deals}
      initialPage={page}
      initialTotalPages={totalPages}
      initialCatalog={{ categories, merchants }}
      communityEnabled={process.env.COMMUNITY_ENABLED === "true"}
    />
    </>
  );
}
