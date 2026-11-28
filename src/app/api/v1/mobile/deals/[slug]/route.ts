import { NextRequest } from "next/server";
import { getDatabase } from "@/server/db/client";
import { publicWhere, dealInclude, publicDealsWithMerchantLogos } from "@/server/deals/repository";
import { listingSchema } from "@/features/deals/validation";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const db = getDatabase();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://metadeals4u.in";

  const row = await db.deal.findFirst({
    where: {
      ...publicWhere(listingSchema.parse({})),
      OR: [{ slug }, { id: slug }],
    },
    include: dealInclude,
  });

  if (!row) {
    return Response.json({ error: "Deal not found or expired." }, { status: 404 });
  }

  const [deal] = await publicDealsWithMerchantLogos(db, [row]);
  return Response.json({
    data: {
      id: deal.id,
      slug: deal.slug,
      title: deal.title,
      brand: deal.brand,
      description: deal.description,
      category: deal.category.name,
      merchant: {
        id: deal.merchant.id,
        name: deal.merchant.name,
        slug: deal.merchant.slug,
        logoUrl: deal.merchant.logoUrl,
      },
      kind: deal.kind,
      headline: deal.headline,
      price: Math.round(deal.priceMinor / 100),
      mrp: Math.round(deal.mrpMinor / 100),
      discountPercent: deal.discountPercent,
      savings: Math.round(deal.savingsMinor / 100),
      imageUrl: deal.image.url.startsWith("http") ? deal.image.url : `${baseUrl}${deal.image.url}`,
      imageGallery: deal.imageGallery.map((image) => image.url.startsWith("http") ? image.url : `${baseUrl}${image.url}`),
      rating: deal.rating,
      reviewCount: deal.reviewCount,
      ratingSource: deal.ratingSource,
      outboundUrl: `${baseUrl}/go/${deal.slug}?c=mobile`,
      publishedAt: deal.publishedAt,
      expiresAt: deal.expiresAt,
      options: deal.options.map((opt) => ({
        id: opt.id,
        merchantName: opt.merchant,
        price: Math.round(opt.priceMinor / 100),
        savings: Math.max(0, Math.round((deal.mrpMinor - opt.priceMinor) / 100)),
        outboundUrl: `${baseUrl}/go/${deal.slug}?option=${opt.id}&c=mobile`,
      })),
    },
  });
}
