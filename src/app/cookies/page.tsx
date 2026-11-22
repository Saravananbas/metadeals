import Link from "next/link";
import type { Metadata } from "next";
import styles from "../privacy/privacy.module.css";

export const metadata: Metadata = { title: "Cookie Policy | MetaDeals4U", description: "Which cookies and browser storage MetaDeals4U uses, and how to control them." };

function Card({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return <section className={styles.card}><h2><span className={styles.num}>{n}</span>{title}</h2>{children}</section>;
}

export default function CookiePolicyPage() {
  return (
    <main className={styles.page}>
      <Link href="/" className={styles.back}>← Back to deals</Link>

      <header className={styles.hero}>
        <h1>Cookie Policy</h1>
        <p>Cookies are small files a website saves in your browser. This page lists what MetaDeals4U uses them for and how you stay in control.</p>
        <span className={styles.meta}>Last updated: 13 November 2026</span>
      </header>

      <div className={styles.glance} aria-label="At a glance">
        <div className={styles.tile}><b>Essential ones only by default</b><span>Sign-in and security.</span></div>
        <div className={styles.tile}><b>Analytics need your OK</b><span>Press Accept to allow them.</span></div>
        <div className={styles.tile}><b>No ad cookies</b><span>We do not run advertising cookies today.</span></div>
        <div className={styles.tile}><b>Change your mind</b><span>Clear site data to choose again.</span></div>
      </div>

      <Card n={1} title="What we use">
        <table className={styles.table}>
          <thead><tr><th>Name or kind</th><th>What it does</th><th>Type</th><th>How long</th></tr></thead>
          <tbody>
            <tr><td><b>Sign-in cookie</b> (member account)</td><td>Keeps you signed in</td><td>Essential</td><td>Until you sign out or it expires</td></tr>
            <tr><td><b>Admin session cookie</b></td><td>Keeps our team signed in to the admin area. Members never receive it.</td><td>Essential</td><td>Short session</td></tr>
            <tr><td><b>Security tokens</b></td><td>Protect sign-in and forms from forgery</td><td>Essential</td><td>Session</td></tr>
            <tr><td><code>md_consent</code> (browser storage)</td><td>Remembers whether you pressed Accept or Decline</td><td>Essential</td><td>Until you clear site data</td></tr>
            <tr><td><code>md_vid</code></td><td>A random visitor code so we can count how many different people visit over several days, instead of counting the same person again every day. It is stored on our side only as a scrambled value</td><td>Analytics, only after you Accept</td><td>180 days, or until you choose Decline</td></tr>
            <tr><td><code>md_sid</code></td><td>A random visit code that links the pages you open in one visit, and how long you stay</td><td>Analytics, only after you Accept</td><td>30 minutes of inactivity</td></tr>
            <tr><td>Saved deals (browser storage)</td><td>Remembers the deals you saved with the heart button, on this device only</td><td>Functional</td><td>Until you clear site data</td></tr>
          </tbody>
        </table>
      </Card>

      <Card n={2} title="Essential cookies">
        <ul>
          <li>They make the site work, so they are always on.</li>
          <li>Without them you could not sign in or use forms safely.</li>
          <li>They do not track you across other websites.</li>
        </ul>
      </Card>

      <Card n={3} title="Analytics">
        <ul>
          <li><b>Before you choose,</b> we only count visits anonymously, using a code that changes every day and cannot follow you from one day to the next. No cookie is set for this.</li>
          <li><b>If you press Accept,</b> we set <code>md_sid</code> and <code>md_vid</code>. It shows us which pages are useful, how long visits last and which deals people click.</li>
          <li>If you are signed in, we link that visit to your account.</li>
          <li><b>If you press Decline,</b> we set no analytics cookie and you still get the whole site.</li>
        </ul>
      </Card>

      <Card n={4} title="Cookies from other companies">
        <ul>
          <li><b>Stores and affiliate networks:</b> when you press Buy Now, you go to the store. The store or its network may set its own cookies to credit the referral. They follow their own policies.</li>
          <li><b>Google and Apple sign-in:</b> if you choose them, they may set cookies on their own pages.</li>
          <li><b>Google Analytics (through Google Tag Manager):</b> loaded on every page, but told not to store any cookies until you press Accept. After you press Accept it counts visits and which pages are used, and may set its own cookies such as <code>_ga</code>. Before that, or if you press Decline, Google may still receive basic page-view signals without cookies. We do not use it for advertising.</li>
          <li><b>YouTube videos:</b> if you open a review video, YouTube may set cookies. See <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google&apos;s privacy policy</a>.</li>
        </ul>
        <div className={styles.note}>We do not currently use advertising cookies. If we add any, we will list them here and ask for your choice first.</div>
      </Card>

      <Card n={5} title="Your choices">
        <ul>
          <li>Use the <b>Accept</b> or <b>Decline</b> buttons in the cookie notice.</li>
          <li>To see the notice again, clear this site&apos;s cookies and site data in your browser settings.</li>
          <li>Your browser can block or delete cookies. Blocking essential cookies may stop sign-in from working.</li>
        </ul>
      </Card>

      <Card n={6} title="More information">
        <p>Read our <Link href="/privacy">Privacy Policy</Link>, <Link href="/terms">Terms &amp; Conditions</Link> and <Link href="/disclaimer">Disclaimer</Link>.</p>
      </Card>
    </main>
  );
}
