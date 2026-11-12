import Link from "next/link";
import type { Metadata } from "next";
import styles from "../privacy/privacy.module.css";

export const metadata: Metadata = { title: "Disclaimer | MetaDeals4U", description: "How to read the deals on MetaDeals4U, and how we earn from them." };

function Card({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return <section className={styles.card}><h2><span className={styles.num}>{n}</span>{title}</h2>{children}</section>;
}

export default function DisclaimerPage() {
  return (
    <main className={styles.page}>
      <Link href="/" className={styles.back}>← Back to deals</Link>

      <header className={styles.hero}>
        <h1>Disclaimer</h1>
        <p>Please read this before you buy anything you find on MetaDeals4U.</p>
        <span className={styles.meta}>Last updated: 13 November 2026</span>
      </header>

      <div className={styles.glance} aria-label="At a glance">
        <div className={styles.tile}><b>Not a recommendation</b><span>A deal listed is not advice to buy.</span></div>
        <div className={styles.tile}><b>The store decides</b><span>Price, stock and terms are the store&apos;s.</span></div>
        <div className={styles.tile}><b>Prices can change</b><span>Check the final price before you pay.</span></div>
        <div className={styles.tile}><b>We may earn a commission</b><span>At no extra cost to you.</span></div>
      </div>

      <Card n={1} title="We list deals, we do not sell">
        <ul>
          <li>MetaDeals4U does not guarantee, approve or endorse the products, services or information at the links on the site.</li>
          <li>A listing is not a recommendation or an invitation to buy a product or to shop at a particular store.</li>
          <li>We do not take payments or deliver products. The sale is between you and the respective ecommerce site, and we are not responsible for it.</li>
        </ul>
      </Card>

      <Card n={2} title="Your purchase is your decision">
        <ul>
          <li>Whatever you buy is your own choice, under the terms of the brand, store and seller you buy from.</li>
          <li>We are not responsible for the authenticity, quality, reliability or price of the products and services at those links.</li>
          <li>Please read the store&apos;s page, reviews, seller details and return policy before you order.</li>
        </ul>
      </Card>

      <Card n={3} title="Prices and details can change">
        <ul>
          <li>We cannot promise that prices, discounts, coupons, stock or other details will stay the same. Stores change them often, without telling us.</li>
          <li>We are not responsible for the content of linked sites, or for changes made there after we published a listing.</li>
          <li><b>If the store&apos;s page and our listing differ, the store&apos;s page is correct.</b></li>
        </ul>
      </Card>

      <Card n={4} title="Community content">
        <ul>
          <li>Some deals, posts and comments are shared by members. They are the members&apos; views, not ours.</li>
          <li>Deals shared in the community forum are <b>not official MetaDeals4U deals</b> until our team publishes them.</li>
          <li>We review reports and remove content that breaks our <Link href="/terms">terms</Link>, but we cannot check everything in advance.</li>
        </ul>
      </Card>

      <Card n={5} title="Affiliate disclosure">
        <div className={styles.good}>Some links on MetaDeals4U are <b>affiliate links</b>. If you buy through them, the store or its network may pay us a small commission, <b>at no additional cost to you</b>.</div>
        <ul>
          <li>The commission does not change the price you pay.</li>
          <li>It helps us keep the site running and free to use.</li>
          <li>Where a placement is paid for, we mark it clearly as an ad or sponsored.</li>
          <li>We aim to list good deals whether or not a commission is paid.</li>
        </ul>
      </Card>

      <Card n={6} title="Acceptance">
        <p>Using MetaDeals4U means you accept this Disclaimer, our <Link href="/terms">Terms &amp; Conditions</Link> and our <Link href="/privacy">Privacy Policy</Link>, including later updates that we publish on the site.</p>
      </Card>
    </main>
  );
}
