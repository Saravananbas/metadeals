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
    where: { ...publicWhere(listingSchema.parse({})), slug },
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
  const row = await getDatabase().deal.findFirst({
    where: { ...publicWhere(listingSchema.parse({})), slug },
    include: dealInclude,
  });

  if (!row) notFound();
  const deal = publicDeal(row);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://metadeals4u.in";

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
      </article>
    </main>
  );
}
