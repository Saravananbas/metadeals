import Link from "next/link";
import type { Metadata } from "next";
import styles from "../privacy/privacy.module.css";

export const metadata: Metadata = { title: "Terms & Conditions | MetaDeals4U", description: "The rules for using MetaDeals4U, in plain words." };

const SECTIONS = [
  ["about", "About these terms"], ["service", "What MetaDeals4U is"], ["prices", "Prices, coupons and availability"], ["affiliate", "Affiliate links"],
  ["buying", "Buying from a store"], ["account", "Your account"], ["content", "Deals, posts and comments you share"], ["messages", "Direct messages"],
  ["use", "Using the site fairly"], ["ip", "Our content and trademarks"], ["report", "Reporting a problem"], ["liability", "Our responsibility"],
  ["changes", "Changes and ending"], ["law", "Governing law"], ["contact", "Contact"],
] as const;

function Card({ id, n, title, children }: { id: string; n: number; title: string; children: React.ReactNode }) {
  return <section id={id} className={styles.card}><h2><span className={styles.num}>{n}</span>{title}</h2>{children}</section>;
}

export default function TermsPage() {
  const contact = process.env.PRIVACY_CONTACT_EMAIL?.trim();
  return (
    <main className={styles.page}>
      <Link href="/" className={styles.back}>← Back to deals</Link>

      <header className={styles.hero}>
        <h1>Terms &amp; Conditions</h1>
        <p>These are the rules for using MetaDeals4U. Please read them. By using the site you agree to them.</p>
        <span className={styles.meta}>Last updated: 13 November 2026</span>
      </header>

      <div className={styles.glance} aria-label="At a glance">
        <div className={styles.tile}><b>We show deals</b><span>We link you to the store. We do not sell.</span></div>
        <div className={styles.tile}><b>Check before you pay</b><span>The store&apos;s page decides the final price.</span></div>
        <div className={styles.tile}><b>Be honest and kind</b><span>Share real deals and respect others.</span></div>
        <div className={styles.tile}><b>Your rights stay</b><span>Nothing here removes rights you have by law.</span></div>
      </div>

      <nav className={styles.toc} aria-label="Contents">
        <strong>On this page</strong>
        <ol>{SECTIONS.map(([id, label]) => <li key={id}><a href={`#${id}`}>{label}</a></li>)}</ol>
      </nav>

      <Card id="about" n={1} title="About these terms">
        <p>These terms are between you and MetaDeals4U (&ldquo;we&rdquo;, &ldquo;us&rdquo;). They cover our website and any apps (&ldquo;the Service&rdquo;). They work together with our <Link href="/privacy">Privacy Policy</Link> and <Link href="/disclaimer">Disclaimer</Link>.</p>
        <p>If you do not agree, please do not use the Service. Nothing here takes away rights you have under law, including consumer law.</p>
      </Card>

      <Card id="service" n={2} title="What MetaDeals4U is">
        <ul>
          <li>MetaDeals4U is an <b>information and deal-discovery service</b>.</li>
          <li>We collect and publish offers sold by <b>various ecommerce stores</b> and give you links to the store&apos;s own page.</li>
          <li>When you press <b>Buy Now</b>, you leave our site. <b>The sale is between you and the respective ecommerce site. We are not responsible for it.</b></li>
          <li>We do not take payments, ship products or handle returns.</li>
        </ul>
      </Card>

      <Card id="prices" n={3} title="Prices, coupons and availability">
        <ul>
          <li>Deal details come from stores, from our team and, in some cases, from other members.</li>
          <li>We try to keep them correct and current, but <b>prices, discounts, coupons, stock and offer terms are set by the store and can change at any time without notice</b>.</li>
          <li>A listing may be out of date by the time you see it.</li>
          <li><b>Always check the price, product, seller and terms on the store&apos;s page before you pay.</b> If the store&apos;s page and our listing differ, the store&apos;s page is what you are charged.</li>
        </ul>
      </Card>

      <Card id="affiliate" n={4} title="Affiliate links">
        <p>Some links are affiliate links. If you buy after clicking one, the store or its network may pay us a commission, <b>at no extra cost to you</b>. It does not change your price.</p>
        <p>If any position on the site is paid for, we will mark it clearly as an ad or sponsored. See the <Link href="/disclaimer">Disclaimer</Link> for more.</p>
      </Card>

      <Card id="buying" n={5} title="Buying from a store">
        <ul>
          <li>The store controls its product pages, checkout, payment, orders, delivery, cancellations, returns, refunds, warranty and customer service.</li>
          <li>Please read the store&apos;s own terms and contact the store directly for these matters.</li>
          <li>This does not limit our responsibility for our own statements, or any right you have under law.</li>
        </ul>
      </Card>

      <Card id="account" n={6} title="Your account">
        <ul>
          <li>You can browse without an account.</li>
          <li>To make an account, give correct details and keep your sign-in safe. Tell us if you think someone else used your account.</li>
          <li>You must be <b>18 or older</b> to have an account.</li>
          <li>We may suspend or close an account that breaks these terms or the law, or puts the Service or others at risk.</li>
          <li>You can stop using your account at any time.</li>
        </ul>
      </Card>

      <Card id="content" n={7} title="Deals, posts and comments you share">
        <p>When you share a deal, post, comment, picture or any other content (&ldquo;Your Content&rdquo;):</p>
        <ul>
          <li>You confirm it is accurate as far as you know, and that you have the right to share it, including any picture or text.</li>
          <li>You give us a <b>free, non-exclusive permission</b> to host, display, format and promote it on the Service and our channels (for example Telegram or WhatsApp posts) for as long as it is on the Service. You keep your own rights in it.</li>
          <li>Deals you submit are <b>reviewed by our team</b> before they appear. We may decline, edit or remove any content. Approval is our choice, not a promise to publish.</li>
          <li>We do not pay for Your Content. Sharing a deal does not make you our employee, agent or partner.</li>
        </ul>
        <div className={styles.note}><b>Please do not post:</b> anything unlawful, hateful, obscene, defamatory or misleading; anything that infringes another person&apos;s rights; other people&apos;s personal details; spam or false deals; or anything harmful, such as malware.</div>
        <p>Your user name, picture, posts and comments are public. Read our <Link href="/privacy">Privacy Policy</Link>.</p>
      </Card>

      <Card id="messages" n={8} title="Direct messages">
        <ul>
          <li>Be respectful. Do not harass, threaten, scam or send spam.</li>
          <li>You can block a member or report a message at any time.</li>
          <li>Messages are private, but our team can read a message that has been reported, to deal with abuse.</li>
        </ul>
      </Card>

      <Card id="use" n={9} title="Using the site fairly">
        <p>You must not:</p>
        <ul>
          <li>try to break, overload or probe the Service, or test its security without our written permission;</li>
          <li>copy content in bulk, or scrape the site in a way that harms it;</li>
          <li>use the Service for fraud, spam or to collect other people&apos;s data;</li>
          <li>get around limits, blocks or protections;</li>
          <li>pretend to be someone else.</li>
        </ul>
        <p>If you find a security problem, please tell us so we can fix it.</p>
      </Card>

      <Card id="ip" n={10} title="Our content and trademarks">
        <ul>
          <li>The MetaDeals4U name, design, logo, software and text we write belong to us or our licensors.</li>
          <li>Store names, logos and product pictures belong to their owners and appear only to identify offers.</li>
          <li>You may view the site and share links for your own use. You may not reuse our content for a competing service without our written permission.</li>
          <li>If you think something on the site infringes your rights, please tell us with the details so we can look into it.</li>
        </ul>
      </Card>

      <Card id="report" n={11} title="Reporting a problem">
        <p>Use <b>Report</b> on a deal, post or comment, or write to us. We review reports and correct or remove content where needed.</p>
      </Card>

      <Card id="liability" n={12} title="Our responsibility">
        <ul>
          <li>We run the Service with reasonable care, but we cannot promise that every listing is free of errors or still available, or that the Service will never be interrupted.</li>
          <li>We are not responsible for the store&apos;s products, prices at checkout, delivery, refunds or conduct. That is between you and the respective ecommerce site.</li>
          <li><b>Nothing in these terms limits</b> liability that the law does not allow us to limit, including for fraud, for our own misleading statements, or your rights as a consumer.</li>
        </ul>
        <p>Read our <Link href="/disclaimer">Disclaimer</Link> too.</p>
      </Card>

      <Card id="changes" n={13} title="Changes and ending">
        <ul>
          <li>We may change the Service and these terms. For changes that matter, we will tell you on the site or by email in advance.</li>
          <li>If you keep using the Service after a change takes effect, you accept it. If you do not agree, you can stop using it.</li>
          <li>If any part of these terms is found invalid, the rest still applies. Not enforcing a term does not mean we give it up.</li>
        </ul>
      </Card>

      <Card id="law" n={14} title="Governing law">
        <p>These terms are governed by the laws of India. Courts in India have jurisdiction, without limiting any right you have under consumer law to bring a claim where that law allows.</p>
      </Card>

      <Card id="contact" n={15} title="Contact">
        {contact
          ? <p>Questions about these terms: <a href={`mailto:${contact}`}>{contact}</a>.</p>
          : <p>Questions about these terms: use the <b>Report</b> option on the site, or write to us through the site.</p>}
      </Card>
    </main>
  );
}
