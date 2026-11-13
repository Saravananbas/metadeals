import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { getDatabase } from "@/server/db/client";
import { publicWhere, dealInclude, publicDealsWithMerchantLogos } from "@/server/deals/repository";
import { listingSchema } from "@/features/deals/validation";
import { formatINR } from "@/features/deals/pricing";
import { DealNavbar } from "@/components/deals/DealNavbar";
import { DealGallery } from "@/components/deals/DealGallery";
import { DealProductInfo } from "@/components/deals/DealProductInfo";
import { DealPurchasePanel } from "@/components/deals/DealPurchasePanel";
import { TrustStrip } from "@/components/deals/TrustStrip";
import { serializeJsonLd } from "@/lib/json-ld";
import { YouTubeReviewsSection } from "@/components/deals/YouTubeReviewsSection";
import { DealViewTracker } from "@/components/deals/DealViewTracker";
import { youtubeReviewsService } from "@/server/youtube/reviews-service";
import styles from "./deal-detail.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const db = getDatabase();
  const row = await db.deal.findFirst({
    where: { ...publicWhere(listingSchema.parse({})), OR: [{ slug }, { id: slug }] },
    include: dealInclude,
  });

  if (!row) {
    return { title: "Deal Not Found · MetaDeals4U" };
  }

  const [deal] = await publicDealsWithMerchantLogos(db, [row]);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://metadeals4u.in";
  const title = `${deal.title} - ${formatINR(deal.priceMinor / 100)} at ${deal.merchant.name} · MetaDeals4U`;
  const description = `${deal.title} on sale for ${formatINR(deal.priceMinor / 100)} (${deal.discountPercent}% off MRP ${formatINR(deal.mrpMinor / 100)}). Compare options and get genuine verified deal alerts on MetaDeals4U.`;

  return {
    title,
    description,
    alternates: {
      // Always the slug address, even when the page was opened by id.
      canonical: `${baseUrl}/deal/${deal.slug}`,
    },
    openGraph: {
      title,
      description,
      url: `${baseUrl}/deal/${deal.slug}`,
      siteName: "MetaDeals4U",
      images: [
        {
          url: deal.image.url.startsWith("http") ? deal.image.url : `${baseUrl}${deal.image.url}`,
          width: 600,
          height: 600,
          alt: deal.image.alt || deal.title,
        },
      ],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [deal.image.url.startsWith("http") ? deal.image.url : `${baseUrl}${deal.image.url}`],
    },
  };
}

export default async function DealDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const db = getDatabase();

  const row = await db.deal.findFirst({
    where: { ...publicWhere(listingSchema.parse({})), OR: [{ slug }, { id: slug }] },
    include: dealInclude,
  });

  if (!row) notFound();

  const [deal] = await publicDealsWithMerchantLogos(db, [row]);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://metadeals4u.in";

  // 1. YouTube Reviews (Admin-controlled; only loads stored reviews)
  const videoReviews = await youtubeReviewsService.getReviewsForDeal(row.id);

  // 2. Recommended Related Deals (Workstream 4: Same Category, Distinct Titles)
  const relatedRecords = await db.deal.findMany({
    where: {
      ...publicWhere(listingSchema.parse({})),
      categoryId: row.categoryId,
      id: { not: row.id },
    },
    include: dealInclude,
    orderBy: [{ featured: "desc" }, { publishedAt: "desc" }],
    take: 20,
  });

  const sameCategoryDeals = relatedRecords
    .filter((candidate) => candidate.title.trim().toLowerCase() !== row.title.trim().toLowerCase())
    .slice(0, 5);
  let relatedRows = sameCategoryDeals;

  if (relatedRows.length < 5) {
    const fallbackRecords = await db.deal.findMany({
      where: { ...publicWhere(listingSchema.parse({})), id: { not: row.id } },
      include: dealInclude,
      orderBy: [{ featured: "desc" }, { publishedAt: "desc" }],
      take: 20,
    });
    const relatedIds = new Set(relatedRows.map((candidate) => candidate.id));
    const relatedTitles = new Set(relatedRows.map((candidate) => candidate.title.trim().toLowerCase()));
    relatedRows = [
      ...relatedRows,
      ...fallbackRecords.filter((candidate) => {
        const title = candidate.title.trim().toLowerCase();
        if (relatedIds.has(candidate.id) || title === row.title.trim().toLowerCase() || relatedTitles.has(title)) return false;
        relatedIds.add(candidate.id);
        relatedTitles.add(title);
        return true;
      }).slice(0, 5 - relatedRows.length),
    ];
  }

  const relatedDeals = await publicDealsWithMerchantLogos(db, relatedRows.slice(0, 5));

  // 3. Schema.org JSON-LD
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: deal.title,
    description: deal.description || deal.title,
    brand: deal.brand ? { "@type": "Brand", name: deal.brand } : undefined,
    image: deal.image.url.startsWith("http") ? deal.image.url : `${baseUrl}${deal.image.url}`,
    offers: {
      "@type": "Offer",
      url: `${baseUrl}/deal/${deal.slug}`,
      priceCurrency: "INR",
      price: (deal.priceMinor / 100).toFixed(2),
      priceValidUntil: deal.expiresAt || undefined,
      availability: "https://schema.org/InStock",
      seller: {
        "@type": "Organization",
        name: deal.merchant.name,
      },
    },
    // No rating markup without a real review count: an invented count breaks Google's rules.
    ...(deal.rating !== null && deal.reviewCount
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: deal.rating,
            reviewCount: deal.reviewCount,
          },
        }
      : {}),
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { name: "Home", item: `${baseUrl}/` },
      { name: deal.category.name, item: `${baseUrl}/?category=${deal.category.slug}` },
      { name: deal.title, item: `${baseUrl}/deal/${deal.slug}` },
    ].map((entry, index) => ({ "@type": "ListItem", position: index + 1, ...entry })),
  };

  // Deals that came from a member's submission show who shared them (their chosen user name, never their real name or email).
  const sharer = (await db.communityDealSubmission.findFirst({
    where: { dealId: row.id, status: "APPROVED" },
    select: { customer: { select: { forumProfile: { select: { handle: true, avatarKey: true } } } } },
  }))?.customer.forumProfile ?? null;

  return (
    <div className={styles.pageWrapper}>
      <DealViewTracker slug={slug} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd([jsonLd, breadcrumbJsonLd]) }}
      />

      {/* Header and Purple Category Navigation Bar */}
      <DealNavbar currentCategorySlug={deal.category.slug} />

      <main className={styles.container}>
        {/* Breadcrumb Navigation */}
        <nav className={styles.breadcrumbNav} aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <ChevronRight size={14} className={styles.breadcrumbSeparator} />
          <Link href="/">MetaDeals4U</Link>
          <ChevronRight size={14} className={styles.breadcrumbSeparator} />
          <Link href="/#deals">All Deals</Link>
          <ChevronRight size={14} className={styles.breadcrumbSeparator} />
          <Link href={`/?category=${deal.category.slug}`}>{deal.category.name}</Link>
          <ChevronRight size={14} className={styles.breadcrumbSeparator} />
          <span className={styles.breadcrumbCurrent} title={deal.title}>
            {deal.title}
          </span>
        </nav>

        {sharer && (
          <p style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 12px", fontSize: 14, color: "var(--md-neutral-700)" }}>
            {sharer.avatarKey
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={`/api/v1/avatars/${sharer.handle}`} alt="" width={28} height={28} style={{ borderRadius: "50%", objectFit: "cover" }} />
              : <span aria-hidden style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--md-purple-100)", color: "var(--md-purple-600)", display: "inline-grid", placeItems: "center", fontWeight: 800 }}>{sharer.handle.slice(0, 1).toUpperCase()}</span>}
            <span>Shared by <strong>@{sharer.handle}</strong></span>
          </p>
        )}

        {/* 3-Column Desktop Product Grid */}
        <div className={styles.productGrid}>
          {/* Column A: Product Image Gallery */}
          <DealGallery
            dealId={deal.id}
            title={deal.title}
            primaryImage={deal.image.url}
            images={deal.imageGallery.map((image) => image.url)}
            discountPercent={deal.discountPercent}
          />

          {/* Column B: Product Information */}
          <DealProductInfo
            title={deal.title}
            brand={deal.brand}
            category={deal.category}
            merchantName={deal.merchant.name}
            description={deal.description}
            rating={deal.rating}
            reviewCount={deal.reviewCount}
            ratingSource={deal.ratingSource}
            currency={deal.currency}
          />

          {/* Column C: Price & Purchase Panel */}
          <DealPurchasePanel
            dealId={deal.id}
            priceMinor={deal.priceMinor}
            mrpMinor={deal.mrpMinor}
            discountPercent={deal.discountPercent}
            savingsMinor={deal.savingsMinor}
            merchantName={deal.merchant.name}
            merchantWebsite={row.merchant.websiteUrl}
            destinationUrl={deal.destinationUrl}
            expiresAt={deal.expiresAt}
            publishedAt={deal.publishedAt}
            options={deal.options}
          />
        </div>

        {/* YouTube Video Reviews Section (Workstream 2 & 3) */}
        {videoReviews.length > 0 && <YouTubeReviewsSection reviews={videoReviews} />}

        {/* Trust Information Strip */}
        <TrustStrip />

        {/* Recommended Deals ("You May Also Like") */}
        {relatedDeals.length > 0 && (
          <section className={styles.recommendedSection} aria-label="Related Deals">
            <h2 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 20px", color: "var(--md-color-text)" }}>
              You May Also Like
            </h2>
            <div className={styles.recommendedGrid}>
              {relatedDeals.map((rel) => (
                <Link
                  key={rel.id}
                  href={`/deal/${rel.slug || rel.id}`}
                  style={{
                    padding: 16,
                    borderRadius: 16,
                    border: "1px solid var(--md-color-border, var(--md-color-border))",
                    background: "var(--md-white)",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    color: "inherit",
                    textDecoration: "none",
                    boxShadow: "0 2px 8px color-mix(in srgb, var(--md-black) 4%, transparent)",
                    transition: "transform 0.15s ease, box-shadow 0.15s ease",
                  }}
                >
                  <div
                    style={{
                      position: "relative",
                      width: "100%",
                      aspectRatio: "1.2",
                      marginBottom: 12,
                      background: "var(--md-color-surface-muted)",
                      borderRadius: 10,
                      overflow: "hidden",
                    }}
                  >
                    {rel.discountPercent > 0 && (
                      <span
                        style={{
                          position: "absolute",
                          top: 8,
                          left: 8,
                          background: "var(--md-red-600)",
                          color: "var(--md-white)",
                          fontSize: 11,
                          fontWeight: 700,
                          padding: "2px 6px",
                          borderRadius: 4,
                          zIndex: 2,
                        }}
                      >
                        {rel.discountPercent}% OFF
                      </span>
                    )}
                    <Image
                      unoptimized
                      src={rel.image.url}
                      alt={rel.image.alt || rel.title}
                      fill
                      style={{ objectFit: "contain", padding: 8 }}
                    />
                  </div>

                  <h3
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      margin: "0 0 8px",
                      lineHeight: 1.4,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {rel.title}
                  </h3>

                  <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                    <strong style={{ color: "var(--md-color-text)", fontSize: 16 }}>
                      {formatINR(rel.priceMinor / 100)}
                    </strong>
                    <del style={{ fontSize: 12, color: "var(--md-color-text-muted)" }}>
                      {formatINR(rel.mrpMinor / 100)}
                    </del>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginTop: 10,
                      paddingTop: 8,
                      borderTop: "1px solid var(--md-color-surface-muted)",
                    }}
                  >
                    <span style={{ fontSize: 12, color: "var(--md-color-text-secondary)", fontWeight: 600 }}>
                      {rel.merchant.name}
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        color: "var(--md-color-primary-hover)",
                        fontWeight: 700,
                      }}
                    >
                      View Deal &rarr;
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
