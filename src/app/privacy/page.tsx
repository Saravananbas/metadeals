import Link from "next/link";
import type { Metadata } from "next";
import styles from "./privacy.module.css";

export const metadata: Metadata = { title: "Privacy Policy | MetaDeals4U", description: "What MetaDeals4U collects, why, who sees it, and the choices you have." };

const SECTIONS = [
  ["who", "Who we are"], ["collect", "What we collect"], ["why", "Why we use it"], ["cookies", "Cookies and analytics"], ["share", "Who we share it with"],
  ["links", "Store links and commission"], ["community", "Community, comments and messages"], ["keep", "How long we keep it"], ["security", "Keeping it safe"],
  ["rights", "Your choices and rights"], ["children", "Children"], ["changes", "Changes to this policy"], ["contact", "Contact and complaints"],
] as const;

function Card({ id, n, title, children }: { id: string; n: number; title: string; children: React.ReactNode }) {
  return <section id={id} className={styles.card}><h2><span className={styles.num}>{n}</span>{title}</h2>{children}</section>;
}

export default function PrivacyPage() {
  const contact = process.env.PRIVACY_CONTACT_EMAIL?.trim();
  return (
    <main className={styles.page}>
      <Link href="/" className={styles.back}>← Back to deals</Link>

      <header className={styles.hero}>
        <h1>Privacy Policy</h1>
        <p>MetaDeals4U helps you find good deals from online stores. This page explains, in plain words, what we collect, why, who sees it and what you can do about it.</p>
        <span className={styles.meta}>Last updated: 13 November 2026</span>
      </header>

      <div className={styles.glance} aria-label="At a glance">
        <div className={styles.tile}><b>We don&apos;t sell your data</b><span>Your personal details are never sold.</span></div>
        <div className={styles.tile}><b>No payments here</b><span>You buy from the store, not from us.</span></div>
        <div className={styles.tile}><b>You can browse freely</b><span>An account is optional.</span></div>
        <div className={styles.tile}><b>You choose analytics</b><span>Decline and still use everything.</span></div>
      </div>

      <nav className={styles.toc} aria-label="Contents">
        <strong>On this page</strong>
        <ol>{SECTIONS.map(([id, label]) => <li key={id}><a href={`#${id}`}>{label}</a></li>)}</ol>
      </nav>

      <Card id="who" n={1} title="Who we are">
        <p>MetaDeals4U (&ldquo;we&rdquo;, &ldquo;us&rdquo;) is a deal-discovery website. We list offers from various ecommerce stores and send you to the store&apos;s own page to buy.</p>
        <div className={styles.good}><b>We do not sell products, take your payment or deliver orders.</b> The sale is between you and the respective ecommerce site, and we are not responsible for it.</div>
      </Card>

      <Card id="collect" n={2} title="What we collect">
        <p>We collect only what the features you use need.</p>
        <table className={styles.table}>
          <thead><tr><th>What</th><th>Examples</th><th>When</th></tr></thead>
          <tbody>
            <tr><td><b>Visit counts</b></td><td>Page opened, time, device type, browser name, the site you came from, and a code that changes every day</td><td>Every visit. We do not store your IP address or full browser details for this.</td></tr>
            <tr><td><b>Account details</b></td><td>Name, email, password (kept only as a one-way scrambled value), or your name and email from Google or Apple sign-in</td><td>Only if you create an account</td></tr>
            <tr><td><b>Profile</b></td><td>User name, profile picture, and, if you choose to add them, sex, date of birth, city or state</td><td>Optional. You type a place yourself; we never read your device location.</td></tr>
            <tr><td><b>Deals you share</b></td><td>Title, link, price, description, picture, store and category</td><td>When you post a deal</td></tr>
            <tr><td><b>Forum, comments and messages</b></td><td>What you write, votes, saves, reports, direct messages</td><td>When you use those features</td></tr>
            <tr><td><b>Buy Now clicks</b></td><td>The deal and store, where you came from (for example a Telegram link), time, and a daily code</td><td>When you press Buy Now</td></tr>
            <tr><td><b>Security records</b></td><td>Technical logs, sign-in attempts, errors</td><td>To keep the site working and safe</td></tr>
          </tbody>
        </table>
        <p>We do <b>not</b> knowingly collect your exact location, card or bank details, government ID numbers, health details or biometric data.</p>
        <p>Deals you save with the heart button are kept on your own device, in your browser.</p>
      </Card>

      <Card id="why" n={3} title="Why we use it">
        <ul>
          <li>To show you the site and run your account, sign you in and keep it secure.</li>
          <li>To review and publish the deals and posts you share, and tell you the outcome.</li>
          <li>To pass you to the store and count referrals correctly.</li>
          <li>To learn which pages are useful, and to show store partners how many people viewed or clicked their deals, as totals.</li>
          <li>To stop spam, fraud and abuse, and to answer complaints.</li>
          <li>To meet legal duties.</li>
        </ul>
        <p>Where we ask for your consent, you can say no and still use the site, and you can change your mind at any time.</p>
      </Card>

      <Card id="cookies" n={4} title="Cookies and analytics">
        <p>The full list is in our <Link href="/cookies">Cookie Policy</Link>.</p>
        <h3>Always on</h3>
        <ul>
          <li><b>Essential cookies</b> keep you signed in and the site secure.</li>
          <li><b>Anonymous counting</b> uses a code that changes every day, so it cannot follow you from one day to the next.</li>
        </ul>
        <h3>Only if you press Accept</h3>
        <ul>
          <li>A small first-party cookie that lasts 30 minutes of inactivity.</li>
          <li>It lets us see the pages you open in one visit, how long you stay and which deals you click, copy a coupon for, share or comment on.</li>
          <li>If you are signed in, we link that visit to your account.</li>
          <li>We keep this detail for 90 days, then only totals.</li>
        </ul>
        <div className={styles.note}>Chose wrongly? Clear this site&apos;s data in your browser and the choice appears again.</div>
      </Card>

      <Card id="share" n={5} title="Who we share it with">
        <p><b>We do not sell your personal data.</b> We share it only like this:</p>
        <ul>
          <li><b>The store and its affiliate network</b>, when you press Buy Now. Your browser sends them the usual technical details, and our link carries our publisher ID and a channel label. We do not send them your name, email or account details.</li>
          <li><b>Service providers</b> who help us run the site, such as our web host. They may use the data only to serve us.</li>
          <li><b>Google and Apple</b>, if you choose to sign in with them. See <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google&apos;s privacy policy</a>.</li>
          <li><b>Google Analytics</b> (through Google Tag Manager), only if you press Accept on the cookie banner. It receives your visit details (pages opened, device and browser type, approximate location from your address). See <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google&apos;s privacy policy</a>.</li>
          <li><b>YouTube</b>, if you open a review video. See <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google&apos;s privacy policy</a>.</li>
          <li><b>Telegram or WhatsApp channels</b>, where we may post deal details (title, price, link), never customer data.</li>
          <li><b>Authorities</b>, when the law requires it.</li>
        </ul>
        <p>Other sites that we link to have their own privacy policies. We are not responsible for them.</p>
      </Card>

      <Card id="links" n={6} title="Store links and commission">
        <p>Buy buttons send you to the store through an affiliate link. The store or network may pay us a commission when you buy, <b>at no extra cost to you</b>. It does not change the price you pay.</p>
        <p>Prices, coupons and stock are set by the store and can change at any time. Please check the final price and terms on the store&apos;s page before you pay.</p>
      </Card>

      <Card id="community" n={7} title="Community, comments and messages">
        <ul>
          <li>Your <b>user name</b>, picture, posts, comments and the deals you share are <b>public</b>. Your email is never shown.</li>
          <li>Do not put personal details, such as phone numbers or addresses, in public posts.</li>
          <li><b>Direct messages</b> are private between you and the other member. Our team can read a message only if someone reports it.</li>
          <li>Moderators may review, remove or restrict content that breaks our <Link href="/community">community rules</Link>.</li>
        </ul>
      </Card>

      <Card id="keep" n={8} title="How long we keep it">
        <ul>
          <li><b>Account and profile:</b> while your account is open.</li>
          <li><b>Detailed visit records with cookies:</b> 90 days, then only totals.</li>
          <li><b>Daily totals:</b> kept so we can see trends.</li>
          <li><b>Posts, comments and deals:</b> until you or a moderator remove them.</li>
          <li><b>Security logs and click records:</b> for as long as needed to run the site safely and meet legal duties.</li>
        </ul>
        <p>When the time ends, we erase the data or remove what identifies you.</p>
      </Card>

      <Card id="security" n={9} title="Keeping it safe">
        <ul>
          <li>Encrypted connections (HTTPS) and one-way scrambled passwords.</li>
          <li>Limited staff access and activity logs for admin actions.</li>
          <li>Checks on what members submit, and rate limits against abuse.</li>
        </ul>
        <div className={styles.note}>No online service is perfectly secure. If a breach affects you, we will tell you without delay and say what happened and what you can do.</div>
      </Card>

      <Card id="rights" n={10} title="Your choices and rights">
        <p>You can ask us to:</p>
        <ul>
          <li><b>Show</b> you the personal data we hold about you.</li>
          <li><b>Correct or update</b> it. You can edit most of it yourself on your profile page.</li>
          <li><b>Delete</b> it, unless we must keep it by law.</li>
          <li><b>Withdraw consent</b> you gave, for example for analytics.</li>
          <li><b>Complain</b> to us, and if you are not satisfied, to the Data Protection Board of India once it is in operation.</li>
        </ul>
        <p>Write to us from the email address on your account so we can confirm it is you.</p>
      </Card>

      <Card id="children" n={11} title="Children">
        <p>MetaDeals4U is for adults aged 18 and over. Please do not create an account if you are under 18. If we learn that an account belongs to a child, we will close it and delete the data.</p>
      </Card>

      <Card id="changes" n={12} title="Changes to this policy">
        <p>If we change this policy in a way that matters, we will tell you on the site and ask for your choice again where needed. The date at the top shows the latest version.</p>
      </Card>

      <Card id="contact" n={13} title="Contact and complaints">
        {contact
          ? <p>Questions, requests or complaints about your data: <a href={`mailto:${contact}`}>{contact}</a>.</p>
          : <p>Questions, requests or complaints about your data: use the <b>Report</b> option on any deal, post or comment, or write to us through the site.</p>}
        <p>Also see our <Link href="/terms">Terms &amp; Conditions</Link>.</p>
      </Card>
    </main>
  );
}
