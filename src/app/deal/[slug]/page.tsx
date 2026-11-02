import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDatabase } from "@/server/db/client";
import { publicWhere, dealInclude, publicDeal } from "@/server/deals/repository";
import { listingSchema } from "@/features/deals/validation";
import { formatINR } from "@/features/deals/pricing";
import styles from "@/features/deals/components/manager.module.css";
export const dynamic = "force-dynamic";
export default async function DealDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const row = await getDatabase().deal.findFirst({ where: { ...publicWhere(listingSchema.parse({})), slug }, include: dealInclude });
  if (!row) notFound();
  const deal = publicDeal(row);
  return <main className={styles.page}><Link href="/">← MetaDeals4U · All deals</Link><article className={styles.panel}><h1>{deal.title}</h1><Image unoptimized src={deal.image.url} alt={deal.image.alt} width={400} height={400} style={{ objectFit: "contain", maxWidth: "100%", height: "auto" }} /><p>{deal.description}</p><p><strong>{formatINR(deal.priceMinor / 100)}</strong> <del>{formatINR(deal.mrpMinor / 100)}</del> · {deal.discountPercent}% off · Save {formatINR(deal.savingsMinor / 100)}</p>{deal.rating !== null && <p>{deal.rating}/5 {deal.reviewCount !== null && `(${deal.reviewCount} reviews)`} · Source: {deal.ratingSource}</p>}<p>{deal.expiresAt ? `Expires ${new Date(deal.expiresAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST` : "Expiry not supplied."}</p><p>Confirm the final price, stock, seller and return policy at checkout. Affiliate links may earn MetaDeals4U a commission.</p><div className={styles.actions}><a href={deal.destinationUrl} target="_blank" rel="sponsored noopener noreferrer">View at {deal.merchant.name} ↗</a>{deal.options.map((option) => <a key={option.id} href={option.destinationUrl} target="_blank" rel="sponsored noopener noreferrer">{option.merchant} · {formatINR(option.priceMinor / 100)} ↗</a>)}</div></article></main>;
}
