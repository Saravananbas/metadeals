# MetaDeals4U Cookie and Similar Technologies Policy

> **DRAFT. Not reviewed by a lawyer.** The cookie table below is built from the code on 12 November 2026. A real scan of the live site and of every app is still required [OWNER TO CONFIRM]. Delete the grey notes before publishing.

**Effective date:** [DATE]  **Last updated:** [DATE]

## 1. What this page covers

"Cookies" are small files a website puts on your device. We also use similar tools such as the storage inside your browser (localStorage and sessionStorage). This page lists each one, why it exists, who sets it, how long it lasts, and whether you can say no.

## 2. Two kinds: essential and optional

- **Essential** items are needed for something you asked for (staying signed in, security, remembering your choice). They do not need your consent.
- **Optional** items (analytics, and advertising if we ever add it) are used **only if you accept them**. You can use the whole site if you decline.

## 3. What we use today

| Name | Type | Provider | Purpose | Lasts | Essential or optional |
|---|---|---|---|---|---|
| `md-customer-session` (`__Secure-md-customer-session` on https) | Cookie | MetaDeals4U | Keeps you signed in to your account | 24 hours | Essential |
| `md-customer-state`, `md-customer-pkce`, `md-customer-nonce` (with `__Secure-` prefix on https) | Cookie | MetaDeals4U | Protect the Google/Apple sign-in step from forgery | 15 minutes | Essential |
| `next-auth.csrf-token` (`__Host-` prefix on https) | Cookie | MetaDeals4U | Protects the sign-in form against forged requests | Browser session | Essential |
| Staff sign-in cookies | Cookie | MetaDeals4U | Staff administration only; never set for visitors | [DURATION] | Essential (staff) |
| `md_consent` | Browser storage | MetaDeals4U | Remembers whether you accepted or declined optional analytics | Until you clear it | Essential (records your choice) |
| `md_seen` | Browser storage | MetaDeals4U | Marks a returning visitor, **only if you accepted** analytics | Until you clear it | Optional |
| `md_sid` | Cookie | MetaDeals4U | Joins the pages of one visit together (random code) **only if you accepted** analytics | 30 minutes after your last activity | Optional |
| `md_v_<deal>` | Cookie | MetaDeals4U | Stops one person adding several views to a deal's view counter | 30 minutes | **[COUNSEL: essential or optional? It is currently set for every visitor. Either treat it as optional and set it only after consent, or remove it.]** |
| `metadeals4u-demo-saved` (rename before launch; the name says "demo") | Browser storage | MetaDeals4U | Remembers deals you saved, on your own device | Until you clear it | Essential (feature you asked for) |
| `viewed_deal_<slug>` | sessionStorage | MetaDeals4U | Avoids counting the same deal twice in a tab | Until you close the tab | [COUNSEL: same question as `md_v_`] |

## 4. Third parties

| Provider | When | What it may do | Your choice |
|---|---|---|---|
| **YouTube (Google)** | When you open a review video on a deal page (embedded from `youtube.com`) | YouTube may set its own cookies and collect data under Google's policy | Recommended change: load videos only after a click and use the privacy-enhanced domain `youtube-nocookie.com` [OWNER TO CONFIRM] |
| **Affiliate network and the store** | When you click Buy Now and land on their site | They may set cookies on **their** pages (for example to credit the referral). We do not control these | Use your browser settings or the store's own cookie notice |
| **Google/Apple sign-in** | If you choose that button | They handle your sign-in on their pages | Do not use that sign-in |
| **Advertising or analytics tools** [NOT IN USE] | Planned only | If added, they will be listed here, off until you accept, and not used for anyone under 18 | n/a |

We do not currently use Google Analytics, Google Ads, Meta Pixel or similar tools. [OWNER TO CONFIRM after the scan. Update this page before adding any.]

## 5. Changing your mind

Use **"Cookie settings"** in the footer [BUILD THIS LINK] to accept or decline optional tools at any time. Declining or withdrawing deletes the `md_sid` cookie and stops optional counting. You can also clear cookies and storage in your browser. Withdrawing is as easy as accepting.

## 6. Notes for the owner and counsel: what the consent screen must do (delete before publishing)

A banner on its own does not create valid consent. For consent-based tools the screen and the process behind it should do all of the following [COUNSEL]:

1. **Separate choices by purpose** (necessary / analytics / advertising, when advertising exists). Not one blanket "accept".
2. **Equal prominence** for "Accept" and "Decline"; no pre-ticked boxes; no wording or colours that push one answer (see the dark-pattern guidelines on interface interference and nagging).
3. **Plain, specific wording** that says what data is used and why, and links to this policy and the Privacy Policy. The notice must make sense on its own (DPDP Rule 3).
4. **Nothing optional runs before a "yes"**: check the order in which scripts load.
5. **No "cookie wall"** and no loss of core functions if the user declines.
6. **Withdrawal** from a visible link, as easy as giving consent.
7. **A consent log**: what text and version was shown, which choice, when, and (where signed in) which account, so that you can prove consent (s. 6(10)).
8. **Repeat the prompt** after a material change in purposes or providers.
9. **Children**: no tracking or targeted advertising for under-18s.
10. **Languages**: offer the notice in English and the languages you serve.

The first-version banner in the code (`src/components/analytics/ConsentBanner.tsx`) does items 4 (partly), 5 and 6 (partly). It does not yet separate purposes, offer a footer "Cookie settings" link, or store a consent log on the server. **Do not rely on it as sufficient.**
