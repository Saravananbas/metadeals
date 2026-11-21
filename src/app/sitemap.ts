import type { MetadataRoute } from "next";
import { getDatabase } from "@/server/db/client";
import { communityEnabled } from "@/server/community/config";

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
    ...(communityEnabled() ? [{ url: `${baseUrl}/community`, changeFrequency: "daily" as const, priority: 0.6 }, { url: `${baseUrl}/community/announcements`, changeFrequency: "weekly" as const, priority: 0.4 }] : []),
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

    // Community pages anyone can read: communities, published discussions and announcements. Each query is soft, so a database that is missing the community tables still gives the deal sitemap.
    const communityRoutes: MetadataRoute.Sitemap = [];
    if (communityEnabled()) {
      const db = getDatabase();
      const [communities, posts, announcements] = await Promise.all([
        db.forumCommunity.findMany({ where: { isActive: true }, select: { slug: true }, take: 500 }).catch(() => []),
        db.forumPost.findMany({ where: { status: "PUBLISHED", community: { isActive: true } }, select: { slug: true, updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 5000 }).catch(() => []),
        db.forumAnnouncement.findMany({ where: { status: "PUBLISHED" }, select: { slug: true, updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 500 }).catch(() => []),
      ]);
      communityRoutes.push(
        ...communities.map((c) => ({ url: `${baseUrl}/community/c/${c.slug}`, changeFrequency: "daily" as const, priority: 0.5 })),
        ...posts.map((x) => ({ url: `${baseUrl}/community/post/${x.slug}`, lastModified: x.updatedAt, changeFrequency: "weekly" as const, priority: 0.5 })),
        ...announcements.map((x) => ({ url: `${baseUrl}/community/announcements/${x.slug}`, lastModified: x.updatedAt, changeFrequency: "monthly" as const, priority: 0.3 })),
      );
    }

    return [...staticRoutes, ...dealRoutes, ...communityRoutes];
  } catch {
    return staticRoutes;
  }
}

