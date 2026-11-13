import type { MetadataRoute } from "next";
import { getDatabase } from "@/server/db/client";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://metadeals4u.in";
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1.0,
    },
    ...["privacy", "terms", "disclaimer", "cookies"].map((page) => ({ url: `${baseUrl}/${page}` })),
  ];

  try {
    const deals = await getDatabase().deal.findMany({
      where: {
        status: "PUBLISHED",
        publishedAt: { not: null, lte: now },
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
      },
      select: {
        slug: true,
        updatedAt: true,
      },
      take: 5000,
      orderBy: { updatedAt: "desc" },
    });

    const dealRoutes: MetadataRoute.Sitemap = deals.map((deal) => ({
      url: `${baseUrl}/deal/${deal.slug}`,
      lastModified: deal.updatedAt,
      changeFrequency: "hourly",
      priority: 0.8,
    }));

    return [...staticRoutes, ...dealRoutes];
  } catch {
    return staticRoutes;
  }
}

