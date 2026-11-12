import { listingSchema } from "@/features/deals/validation";
import { getDatabase } from "@/server/db/client";
import { dealInclude, publicDealsWithMerchantLogos, publicWhere, type DealRecord } from "@/server/deals/repository";
import { api, json } from "@/server/http";
import { youtubeReviewsService } from "@/server/youtube/reviews-service";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return api(async () => {
    const { slug } = await params;
    const db = getDatabase();
    const record = await db.deal.findFirst({
      where: {
        ...publicWhere(listingSchema.parse({})),
        OR: [{ slug }, { id: slug }],
      },
      include: dealInclude,
    });

    if (!record) {
      return json({ error: { code: "NOT_FOUND", message: "Deal unavailable." } }, 404);
    }

    // Select up to 3 related active/published deals in the same category, excluding the current deal
    const relatedRecords = await db.deal.findMany({
      where: {
        ...publicWhere(listingSchema.parse({})),
        categoryId: record.categoryId,
        id: { not: record.id },
      },
      include: dealInclude,
      orderBy: [
        { featured: "desc" },
        { publishedAt: "desc" },
      ],
      take: 12,
    });

    const selectedRelated: DealRecord[] = [];
    const seenMerchants = new Set<string>();

    // Pass 1: Prefer distinct merchants and distinct titles
    for (const rel of relatedRecords) {
      if (selectedRelated.length >= 3) break;
      if (!seenMerchants.has(rel.merchantId) && rel.title !== record.title) {
        selectedRelated.push(rel);
        seenMerchants.add(rel.merchantId);
      }
    }

    // Pass 2: Fill remaining slots with distinct titles
    if (selectedRelated.length < 3) {
      for (const rel of relatedRecords) {
        if (selectedRelated.length >= 3) break;
        if (!selectedRelated.some((s) => s.id === rel.id) && rel.title !== record.title) {
          selectedRelated.push(rel);
        }
      }
    }

    // Pass 3: Fill up to 3 with any eligible deals from the same category if still under 3
    if (selectedRelated.length < 3) {
      for (const rel of relatedRecords) {
        if (selectedRelated.length >= 3) break;
        if (!selectedRelated.some((s) => s.id === rel.id)) {
          selectedRelated.push(rel);
        }
      }
    }

    const videoReviews = await youtubeReviewsService.getReviewsForDeal(record.id);

    const [dealWithLogo, relatedDealsWithLogos] = await Promise.all([
      publicDealsWithMerchantLogos(db, [record]),
      publicDealsWithMerchantLogos(db, selectedRelated),
    ]);

    return json({
      data: {
        ...dealWithLogo[0],
        videoReviews,
        relatedDeals: relatedDealsWithLogos,
      },
    });
  });
}
