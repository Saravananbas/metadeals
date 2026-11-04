import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDatabase } from "@/server/db/client";
import { publicWhere, dealInclude, publicDeal } from "@/server/deals/repository";
import { listingSchema } from "@/features/deals/validation";
import { formatINR } from "@/features/deals/pricing";
import styles from "@/features/deals/components/manager.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const row = await getDatabase().deal.findFirst({
    where: { ...publicWhere(listingSchema.parse({})), OR: [{ slug }, { id: slug }] },
    include: dealInclude,
  });

  if (!row) {
    return { title: "Deal Not Found · MetaDeals4U" };
  }

  const deal = publicDeal(row);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://metadeals4u.in";
  const title = `${deal.title} - ${formatINR(deal.priceMinor / 100)} at ${deal.merchant.name} · MetaDeals4U`;
  const description = `${deal.title} on sale for ${formatINR(deal.priceMinor / 100)} (${deal.discountPercent}% off MRP ${formatINR(deal.mrpMinor / 100)}). Compare options and get genuine verified deal alerts on MetaDeals4U.`;

  return {
    title,
    description,
    alternates: {
      canonical: `${baseUrl}/deal/${slug}`,
    },
    openGraph: {
      title,
      description,
      url: `${baseUrl}/deal/${slug}`,
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

export default async function DealDetail({
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
  const deal = publicDeal(row);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://metadeals4u.in";

  const relatedRecords = await db.deal.findMany({
    where: {
      ...publicWhere(listingSchema.parse({})),
      categoryId: row.categoryId,
      id: { not: row.id },
    },
    include: dealInclude,
    orderBy: [{ featured: "desc" }, { publishedAt: "desc" }],
    take: 6,
  });
  const relatedDeals = relatedRecords.filter((r) => r.title !== row.title).slice(0, 3).map(publicDeal);

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
    ...(deal.rating !== null
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: deal.rating,
            reviewCount: deal.reviewCount || 1,
          },
        }
      : {}),
  };

  return (
    <main className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Link href="/">← MetaDeals4U · All deals</Link>
      <article className={styles.panel}>
        <h1>{deal.title}</h1>
        <Image
          unoptimized
          src={deal.image.url}
          alt={deal.image.alt}
          width={400}
          height={400}
          style={{ objectFit: "contain", maxWidth: "100%", height: "auto" }}
        />
        <p>{deal.description}</p>
        <p>
          <strong>{formatINR(deal.priceMinor / 100)}</strong>{" "}
          <del>{formatINR(deal.mrpMinor / 100)}</del> · {deal.discountPercent}% off · Save {formatINR(deal.savingsMinor / 100)}
        </p>
        {deal.rating !== null && (
          <p>
            {deal.rating}/5 {deal.reviewCount !== null && `(${deal.reviewCount} reviews)`} · Source: {deal.ratingSource}
          </p>
        )}
        <p>
          {deal.expiresAt
            ? `Expires ${new Date(deal.expiresAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST`
            : "Expiry not supplied."}
        </p>
        <p>Confirm the final price, stock, seller and return policy at checkout. Affiliate links may earn MetaDeals4U a commission.</p>
        <div className={styles.actions}>
          <a href={deal.destinationUrl} target="_blank" rel="sponsored noopener noreferrer">
            View at {deal.merchant.name} ↗
          </a>
          {deal.options.map((option) => (
            <a key={option.id} href={option.destinationUrl} target="_blank" rel="sponsored noopener noreferrer">
              {option.merchant} · {formatINR(option.priceMinor / 100)} ↗
            </a>
          ))}
        </div>
        {relatedDeals.length > 0 && (
          <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid var(--md-color-border)" }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>You May Also Like</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
              {relatedDeals.map((rel) => (
                <Link
                  key={rel.id}
                  href={`/deal/${rel.slug || rel.id}`}
                  style={{
                    padding: 12,
                    borderRadius: 14,
                    border: "1px solid var(--md-color-border)",
                    background: "var(--md-color-surface)",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    color: "inherit",
                    textDecoration: "none",
                  }}
                >
                  <div style={{ position: "relative", width: "100%", height: 120, marginBottom: 8 }}>
                    <Image
                      unoptimized
                      src={rel.image.url}
                      alt={rel.image.alt || rel.title}
                      fill
                      style={{ objectFit: "contain" }}
                    />
                  </div>
                  <h3 style={{ fontSize: 13, fontWeight: 700, margin: "6px 0", lineHeight: 1.3 }}>{rel.title}</h3>
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                    <strong style={{ color: "var(--md-deal-price)" }}>{formatINR(rel.priceMinor / 100)}</strong>
                    <del style={{ fontSize: 12, color: "var(--md-deal-mrp)" }}>{formatINR(rel.mrpMinor / 100)}</del>
                  </div>
                  <span style={{ fontSize: 11, color: "var(--md-color-primary)", marginTop: 6, fontWeight: 700 }}>
                    {rel.merchant.name} · View Deal →
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </article>
    </main>
  );
}
