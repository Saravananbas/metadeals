# MetaDeals4U legal-compliance package (DRAFT for review by Indian counsel)

**Read this first.** This package was prepared by an AI assistant from public sources accessed on **12 November 2026** and from the code in this repository. It is **not legal advice**, it was **not reviewed or approved by a lawyer**, and it does not make anyone your lawyer. Where a fact about the business is unknown it is marked **[OWNER TO CONFIRM]**. Where a legal point needs a lawyer's decision it is marked **[COUNSEL]**. Do not publish any draft until both kinds of marker are resolved.

Contents of `docs/legal/`:

| File | What it is |
|---|---|
| `README.md` (this file) | Summary, law status, assumptions table, page/control checklist, launch checklist, questions for counsel, sources |
| `01-privacy-policy.md` | Draft Privacy Policy |
| `02-cookie-policy.md` | Draft Cookie and Similar Technologies Policy, with a cookie inventory taken from the code |
| `03-terms-of-use.md` | Draft Terms of Use |
| `04-affiliate-disclosure.md` | Draft Affiliate Disclosure plus short wording for buy buttons |
| `05-community-guidelines.md` | Draft User Deal Submission and Community Guidelines |
| `06-contact-and-grievance.md` | Draft Contact, Complaints and Grievance page |

---

## 1. Plain-English summary

### 1.1 What MetaDeals does legally if it only advertises deals and sends people to retailers

On the facts given, MetaDeals4U is a **publisher of deal information and advertising** that earns commission when people click through and buy. It is not the seller. Even so, it is not legally invisible. Several laws can still apply to it at the same time:

- **Advertising and consumer law.** What MetaDeals says about a price, a discount, a coupon, a rating or a "featured" deal is a commercial statement. The Consumer Protection Act, 2019 and the CCPA's misleading-advertisement and dark-pattern guidelines apply to misleading statements and deceptive design. A commission connection that shoppers would not expect must be disclosed (see §3).
- **Data protection.** The moment MetaDeals keeps accounts, profile details, comments, submitted deals or visitor analytics, it is a **Data Fiduciary** under the Digital Personal Data Protection Act, 2023 once that Act's main provisions start (13 May 2027 on the dates in §2). Until then the IT Act's section 43A and the 2011 SPDI Rules still apply to a "body corporate" that handles personal data such as passwords [COUNSEL: confirm the entity type].
- **Intermediary law.** For **comments and user-submitted deals**, MetaDeals hosts third-party content. That can make it an "intermediary" for those features, with due-diligence duties (grievance officer, published rules, notice to users, takedown handling) if it wants the safe harbour of section 79 of the IT Act [COUNSEL].
- **Cyber-incident rules.** CERT-In's 2022 directions on incident reporting and log keeping apply to service providers and bodies corporate generally.

### 1.2 What MetaDeals can and cannot allocate to retailers

*Can reasonably say* (only where it is factually true): the retailer controls its product page, checkout, payment processing, order acceptance, stock, fulfilment, delivery, cancellations, returns, refunds, warranties and its own terms; prices, coupons and availability can change on the retailer's site, so shoppers must check the retailer's page before paying.

*Cannot disclaim for itself:*
- the accuracy of **its own** statements and of anything it presents as fact (for example "price at time of listing", "% off", "verified", "lowest price", ratings it publishes);
- a **clear commission disclosure**;
- its own handling and security of personal data;
- its duties as host of user content (moderation process, grievance channel, takedown);
- liability for its own negligence or misconduct, and any liability that mandatory law does not allow it to exclude;
- consumers' **statutory rights**, which cannot be waived by contract.

The drafts follow this split. They do **not** contain a "we are not responsible for anything" clause.

### 1.3 Do the Consumer Protection (E-Commerce) Rules, 2020 apply?

**Unresolved [COUNSEL].** The Rules apply to an "e-commerce entity": a person who owns, operates or manages a digital platform **for electronic commerce**, other than a seller on a marketplace. "E-commerce" in the Act means buying or selling goods or services over a digital network. A site that neither buys nor sells, takes no payment and merely refers shoppers to retailers is **arguably outside** the Rules, but this is a classification question, not a certainty. Facts that decide it:

1. Whether MetaDeals ever takes payment, takes an order, holds a cart, or handles refunds (not in this repository, but **[OWNER TO CONFIRM]** for every future feature, including the mobile apps).
2. Whether retailers "list" on MetaDeals under contract (marketplace-like), or MetaDeals staff select and publish deals (editorial).
3. Whether MetaDeals "facilitates transactions between buyers and sellers" in the sense of the marketplace definition, for example through deep integration, order tracking or paid placement.
4. Whether customer-submitted deals are treated as seller offers.
5. How the commercial relationship is documented (affiliate network terms versus a direct seller agreement).

Because the Rules' consumer-facing items are low-cost (published business identity, a grievance officer who acknowledges within 48 hours and resolves within one month, clear information), **the drafts adopt the conservative position** and show those items voluntarily. That is a recommendation, not an admission that the Rules apply.

### 1.4 DPDP obligations and dates

Dates below come from the Act's commencement notification **G.S.R. 843(E)** and the DPDP Rules, 2025 notification **G.S.R. 846(E)** (both 13 November 2025). The status below is what I could establish; see §2 for sources.

| Date | What starts |
|---|---|
| 13 Nov 2025 | Short title/commencement, definitions, Data Protection Board provisions (ss. 18-26), s. 35, ss. 38-43, s. 44(1) and (3); Rules 1, 2 and 17-21 |
| 13 Nov 2026 | Consent Manager provisions: s. 6(9), s. 27(1)(d) and Rule 4 (these affect consent managers, not an ordinary website) |
| 13 May 2027 | The core duties: ss. 3-5, 6(1)-(8) and (10), 7-17, 27 (rest), 28-34, 36-37 and s. 44(2) (which omits IT Act s. 43A); Rules 3, 5-16, 22 and 23 (notice, security, breach intimation, retention, contact publication, children, data-principal rights, grievance period, transfers) |

A January 2026 proposal to shorten the 18-month period to 12 months was reported. I found **no evidence that it was notified** in the sources available, but those sources are secondary; **check the Gazette and MeitY's site before relying on 13 May 2027 [COUNSEL]**.

What this means for MetaDeals' features:

- **Accounts, comments, submissions, analytics, affiliate click records** are all personal data processing. Under the Act, processing needs consent (a specific, informed, unconditional and unambiguous request with a compliant notice) or a "legitimate use" under s. 7. Rule 3 sets what the notice must contain; withdrawal must be as easy as giving consent.
- **Security safeguards (Rule 6)** are a minimum list (encryption/masking, access control, logs and monitoring, backups, processor contracts, one-year log retention).
- **Breach (Rule 7)**: tell affected users without delay and the Board without delay, with a detailed report within 72 hours.
- **Retention (Rule 8(3))**: personal data, traffic data and logs of processing must be kept for **at least one year** for the Seventh Schedule purposes, then erased. This sits uncomfortably with short retention promises; **[COUNSEL]** to confirm how it applies.
- **Publish contact details (Rule 9)** and **rights and grievance mechanisms (Rule 14)**; the grievance response period must not exceed **ninety days**.
- **Children (s. 9, Rule 10)**: a "child" is anyone under 18. Verifiable parental consent is needed before processing a child's data, and tracking, behavioural monitoring and targeted advertising to children are barred (subject to the Fourth Schedule). The simplest safe course for a deals site is to **restrict accounts to adults and build no features aimed at under-18s [COUNSEL]**.
- **Penalties** under the Act's Schedule reach up to ₹250 crore for failing security safeguards and ₹200 crore for breach-notification or children's-data failures.

### 1.5 What should stay disabled until the process behind it exists

| Keep off | Until |
|---|---|
| Collecting **sex, date of birth and location** in profiles | A written product purpose exists, the notice names it, and the fields are optional. **Recommendation: leave these fields out unless a documented purpose requires them** |
| **Visitor session tracking, time on site, customer linking** (analytics) | Cookie/notice UI is reviewed, Privacy Policy is live, consent records are stored, retention and erase jobs work |
| **Google Ads / AdSense / any advertising cookie** | Consent gating by purpose, privacy policy disclosure, no personalised ads to anyone who could be under 18 |
| **User-submitted deals** | Community Guidelines, moderation SOP, grievance officer, report/takedown route, and a decision on counsel question E3 |
| **Public comments** | Same moderation and takedown route |
| **Mobile apps** | Store privacy declarations match the policy; in-app account deletion; privacy link inside the app |
| Posting **user content** to Telegram or WhatsApp channels | Rights over the content are clear (Terms licence) and takedown also covers copies |

---

## 2. Status of each law (as found on 12 November 2026)

| Law / instrument | Status | Key citation | Where I read it |
|---|---|---|---|
| Digital Personal Data Protection Act, 2023 (Act 22 of 2023) | **Partly commenced.** Core duties scheduled for 13 May 2027 | Commencement notification G.S.R. 843(E), 13 Nov 2025 | Act text read on an unofficial site; commencement from secondary sources **[verify against Gazette]** |
| Digital Personal Data Protection Rules, 2025 | **Partly commenced** (Rules 1, 2, 17-21 now; Rule 4 on 13 Nov 2026; Rules 3, 5-16, 22, 23 on 13 May 2027) | G.S.R. 846(E), Gazette of India (Extraordinary) Part II Sec. 3(i), 13 Nov 2025 | Full text read from a mirror whose header and Rule 1 match the Gazette; official MeitY copy blocked automated access |
| Possible shortening of the 18-month period | **Proposal only** in sources found | Stakeholder meeting 22-23 Jan 2026 (reported) | Secondary only **[COUNSEL: check Gazette]** |
| IT Act, 2000 s. 43A and SPDI Rules, 2011 | **In force** until DPDP s. 44(2) commences (13 May 2027 on the schedule above) | IT (Reasonable Security Practices and Procedures and Sensitive Personal Data or Information) Rules, 2011 | Secondary |
| IT Act, 2000 s. 79 and IT (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021 (as amended; an amendment took effect 15 Nov 2025 per a secondary source) | **In force** | Rule 3 (due diligence, grievance officer: 24-hour acknowledgement, 15-day disposal) | Secondary; MeitY consolidated PDF blocked **[COUNSEL: read the current consolidated text]** |
| CERT-In Directions of 28 April 2022 (s. 70B(6) IT Act) | **In force** (since 27 June 2022) | 6-hour incident reporting; 180-day logs | Secondary |
| Consumer Protection Act, 2019 | **In force** | s. 2(16) e-commerce, s. 2(28) misleading advertisement, s. 2(47) unfair trade practice, s. 18 and s. 21 (CCPA), s. 89 | Section numbers confirmed from the CCPA guidelines text for s. 2(28) and s. 18; others **[verify]** |
| Consumer Protection (E-Commerce) Rules, 2020 | **In force.** A July 2021 draft amendment was found; I did **not** find a notified amendment | G.S.R. 462(E), 23 Jul 2020 (made under s. 101(1)(zg)) | Secondary reproductions **[COUNSEL: read the Gazette text]** |
| CCPA Guidelines for Prevention of Misleading Advertisements and Endorsements for Misleading Advertisements, 2022 | **In force** since 9 Jun 2022 | F. No. J-25/4/2020-CCPA (Reg); cl. 13 (endorsement due diligence), cl. 14 (disclosure of material connection) | **Official PDF read** |
| CCPA Guidelines for Prevention and Regulation of Dark Patterns, 2023 | **In force** since 30 Nov 2023 | Gazette No. 783, 30 Nov 2023; Annexure 1 lists 13 dark patterns including "false urgency" and "disguised advertisement" | **Official PDF read** |
| CCPA advisory on self-audit of dark patterns by e-commerce platforms | Advisory, 5 Jun 2025 | CCPA website listing | Listing only |
| Apple App Store and Google Play privacy requirements | Platform rules (not law) | App Privacy Details; Play Data safety section | Google Play help page via search; Apple via secondary |

I did not find, and make no statement about, any other law that is specific to a deal-aggregation site. **[COUNSEL]** should consider: the Copyright Act (takedown of copied product photos and text), the Legal Metrology rules if the site is held to be an e-commerce entity, the Telecom Commercial Communications rules if marketing SMS is ever sent, GST on commission income, and the Digital Personal Data Protection **Act's** possible exemption for small start-ups under s. 17 if the Government ever notifies one.

---

## 3. A note on the CCPA guidelines most relevant to a deals site

- **Material-connection disclosure (2022 guidelines, cl. 14).** Where there is a connection between an endorser and the trader or advertiser that might materially affect the value or credibility of the endorsement and the audience would not reasonably expect it, it must be "fully disclosed". An affiliate commission on a recommendation is the standard example; the drafts therefore place a plain disclosure next to every buy button and on a dedicated page. **[COUNSEL]**: whether a deals site is an "endorser" or "advertiser" under the 2022 definitions (the "advertiser" definition speaks of promoting "his" own goods) is a legal point, but the safest practice is disclosure anyway.
- **Dark patterns (2023).** Annexure 1 treats **"showing false popularity"** as false urgency and **"masking advertisements as other types of content"** as disguised advertisement. It applies to "platforms systematically offering goods or services in India", advertisers and sellers; whether MetaDeals is a "platform" is again a classification question, but the conduct rules are the standard to design to.

### Important finding in the code (needs a decision before launch)

`src/features/home/components/DealCard.tsx` currently **invents the like counts** shown on every deal card: the initial count is calculated as `Math.floor((reviewCount || 40) / 4) + 12` and likes are not stored. Customers therefore see numbers such as "413 likes" that no customer produced. This is the kind of "false popularity" the 2023 guidelines list as a dark pattern, and it also risks being a misleading representation under the Consumer Protection Act. **Recommendation: remove the display or replace it with a real stored count before any public launch.** The drafts assume the likes shown are real; if they are not changed, the drafts are not accurate.

Other things in the code that the drafts rely on, all to be re-checked: view counts (real, incremented per visit), share counts (real), rating numbers (come from the retailer source with a "rating source" label), the "Trending" search chips (**[OWNER TO CONFIRM]** whether they reflect real data), and "Featured" placement (set by staff; **[OWNER TO CONFIRM]** that no placement is paid).

---

## 4. Current versus planned functionality (checked against the repository)

| Feature | Status in code | Notes for the policies |
|---|---|---|
| Public deal pages, deal listings, product images | **Live on staging** | Retailer logos/images: confirm rights **[OWNER TO CONFIRM]** |
| Outbound "Buy Now" via `/go/<deal>` with Cuelinks wrapping | **Live on staging** (wrap mode switched on) | Click record stores deal, store, channel and a daily-rotating hash; the redirect URL carries the publisher ID and `subid` |
| Customer accounts (email + password, Google, Apple) | **Live on staging** | Email delivery provider in code is "resend"/local; staging uses SMTP settings, **[OWNER TO CONFIRM] which provider actually sends mail** |
| Profile fields (sex, date of birth, location) | **Built locally, not deployed** | All optional; location is typed text, not device location |
| Customer deal submissions with admin review | **Built locally, not deployed** | Private until an admin approves and publishes |
| Public comments (guest name + text) | **Live on staging** | Rate limiting uses a hashed IP; the IP hash is not stored with the comment |
| Visitor analytics (page views, optional session timeline) | **Built locally, not deployed** | Anonymous daily counts for all visitors; session cookie only after "Accept"; the banner is a first version |
| Deal view counter cookie (`md_v_*`) | **Live on staging** | Set for every visitor without a choice; see Cookie Policy §4 |
| YouTube review videos | **Live on staging** | Uses `youtube.com/embed`, so YouTube may set cookies when a video is opened |
| Telegram auto-post of published deals | **Built, switched off** (no bot token) | Contains deal data only, no customer data |
| WhatsApp posting | **Code exists, not enabled** | Same |
| Mobile apps (Android, iOS) | **Planned** | Needs store privacy declarations |
| Advertising (Google Ads/AdSense) | **Planned** | Not in code |

---

## 5. A. Legal and product assumptions to verify

| # | Assumption or fact to verify | Why it matters legally | Evidence / product owner needed | Drafting consequence if false |
|---|---|---|---|---|
| A1 | Legal entity name, form (company / LLP / proprietorship), registered address, country, CIN/GSTIN, contact email | Identity must be published; entity type decides s. 43A "body corporate" status, the E-Commerce Rules' company requirement (if they apply) and contract/jurisdiction clauses | Incorporation certificate, GST certificate | Every document's operator block and the governing-law clause change |
| A2 | MetaDeals never takes payment, accepts orders, holds a cart, ships or refunds | Decides whether it is an e-commerce entity (marketplace or inventory) at all | Product owner sign-off; payment-provider list (should be none) | Terms §5 and §6 and the E-Commerce analysis must be redrawn |
| A3 | Affiliate networks and direct retailer programmes in use (Cuelinks; Amazon Associates? Flipkart?) | Each programme has disclosure wording and rules (Amazon requires specific wording) | Signed programme terms; dashboard screenshots | Affiliate Disclosure wording and retailer-specific lines change |
| A4 | Exactly what is sent to the affiliate network and retailer on a click | The Privacy Policy must say what is shared | Network/redirect logs; Cuelinks API settings | "What we share with retailers" table changes |
| A5 | All personal data collected on web **and** mobile: accounts, profile, submissions, comments, support mail, IP/device logs, analytics, advertising IDs | Data inventory is the base of every notice and of Rule 3 itemisation | A written data inventory (template in §7) | Privacy Policy §3 and store declarations change |
| A6 | Whether exact location is ever collected | Precise geolocation is intrusive and needs a specific purpose | Mobile permission list; web code review | Policy must say "typed city/state only" (current assumption) or add a separate consent |
| A7 | Whether sex/gender and date of birth are necessary, and for what stated purpose | DPDP asks for data limited to a specified purpose; unexplained collection invites complaints | Product requirement document naming the purpose | If no purpose: remove the fields (recommended) and the policy lines |
| A8 | Whether under-18s can register; whether any age check exists | s. 9 and Rule 10 (verifiable parental consent; no tracking or targeted ads to children) | Registration flow, Terms | If minors can register: parental-consent flow needed, or block them |
| A9 | Processors, hosting location, email, auth, analytics providers, retention | Rule 6(1)(f) needs security terms in processor contracts; transfers (Rule 15) and CERT-In log location | Hostinger plan details (data-centre country), contract copies, SMTP provider | Processor and transfer sections change |
| A10 | Whether comments and user-submitted deals are enabled and how moderation works | Intermediary duties and takedown handling | Admin process document; who reviews; response times | Community Guidelines and Terms change |
| A11 | Grievance contact and response process (named person, email, SLA) | Required for intermediaries, and a DPDP requirement; E-Commerce Rules if applicable | Appointment letter for the officer | The contact page cannot be published without a named officer |
| A12 | Whether the service targets users outside India | Territorial reach of other laws, language and currency, store listings | Marketing and store settings | Add jurisdiction notices or geo-block |
| A13 | Whether any "featured", "trending" or ranking placement is paid for | Must be disclosed; affects "disguised advertisement" risk | Commercial agreements | Add "sponsored" labelling and disclosure text |
| A14 | Rights to show retailer logos and product images | Copyright/trade-mark exposure | Retailer or programme permission | Remove assets or add attribution/permission statements |
| A15 | Email used for support and who reads it | Needed for rights requests (Rule 9, 14) | Mailbox owner | Contact page cannot go live |

---

## 6. C. Pages and operational controls (prioritised)

Legend: **Required** = likely legally required on the facts given, with the reason; **Strongly recommended** = good practice or reduces risk but not clearly mandatory; **Depends** = turns on a fact or classification.

| Priority | Item | Class | Basis and applicability |
|---|---|---|---|
| 1 | Privacy Policy | **Required** (now) and strengthened for 13 May 2027 | SPDI Rules 2011 r. 4 (published policy for a body corporate holding personal information/SPDI such as passwords); IT Intermediary Rules 2021 r. 3(1)(a) (privacy policy) if an intermediary; DPDP notice (s. 5, Rule 3) from 13 May 2027 |
| 2 | Terms of Use / user agreement | **Required if an intermediary** (r. 3(1)(a)); otherwise strongly recommended | IT Intermediary Rules 2021 |
| 3 | Grievance Officer name, contact and process | **Required if an intermediary** (r. 3(2)); DPDP grievance system and contact publication (Rules 9, 14) from 13 May 2027; E-Commerce Rules r. 4 **if they apply** | Named person with working email |
| 4 | Affiliate Disclosure (page and at each buy button) | **Strongly recommended, and likely needed** in substance | CCPA 2022 guidelines cl. 14 (material connection); programme terms |
| 5 | Cookie / privacy choices control (settings link, accept/decline, per-purpose) | **Required for any consent-based tracking** (valid consent under s. 6 from 13 May 2027); strongly recommended now | A banner alone does not create valid consent; see Cookie Policy §6 |
| 6 | Community Guidelines for user content | **Required if an intermediary** (r. 3(1)(b) rules to users); strongly recommended otherwise | Comments and user-submitted deals |
| 7 | Report a deal / report content / copyright takedown route | **Required in substance if an intermediary** (grievance and takedown); strongly recommended otherwise | Public "Report" button on each deal and comment |
| 8 | Account data access, correction, consent withdrawal and **account deletion** route | **Required** from 13 May 2027 (ss. 11-13, Rule 14); Apple requires in-app deletion for apps with account creation | Build a self-service route plus an email fallback |
| 9 | Legal identity / business details in the footer (name, address, contact) | **Required if the E-Commerce Rules apply** (r. 4(2)); strongly recommended otherwise | Also feeds the contact page |
| 10 | Retailer notice next to outbound buttons ("price set by the store; we may earn a commission") | **Strongly recommended** | Avoids misleading impressions; supports cl. 14 |
| 11 | Accessibility statement | **Depends / recommended**; not clearly required for a private deals site | **[COUNSEL]** whether the Rights of Persons with Disabilities Act accessibility duties reach a private website |
| 12 | Mobile app privacy disclosures (App Store privacy details and Play Data safety) and privacy link in the app | **Required by the platforms** before release | Must match the policy and every SDK |
| 13 | Data inventory, retention schedule, processor contracts | **Required in substance** for Rules 3, 6, 8 from 13 May 2027 | See §7 |
| 14 | Security controls evidence: access control, logging, backups, 2FA for staff | **Required in substance** (Rule 6; SPDI r. 8) | Keep dated evidence |
| 15 | Incident / breach runbook (CERT-In 6 hours; DPDP Board and users; 72-hour report) | **Required in substance** | Name who decides and who contacts whom |
| 16 | Consent records (what text, which version, when) | **Required in substance** (the Fiduciary bears the burden of proving consent, s. 6(10)) | Store version and timestamp |
| 17 | Moderation procedure and log | **Required for intermediary due diligence in practice** | Who, how fast, what reasons are given |
| 18 | Age policy (18+ or parental-consent flow) | **Required decision** (s. 9, Rule 10) | See §1.4 |

---

## 7. D. Launch checklist (owner to complete)

Fill in every line before publishing any draft.

- [ ] Legal entity name, form, registered address, CIN/GSTIN [OWNER TO CONFIRM]
- [ ] Contact email for users, for rights requests, and for takedown notices; phone if any
- [ ] Named **Grievance Officer** (and DPO or contact person for data questions) with designation and email; written appointment kept on file
- [ ] **Data inventory** complete: each field, why collected, where stored, who can read it, retention, processor. Columns: data item | purpose | source | system | processor | retention | access
- [ ] **Cookie and storage scan** of the live site and the apps (browser dev tools plus a scanner); table in the Cookie Policy replaced with verified results
- [ ] **Retention periods** decided for accounts, comments, submissions, click logs, analytics, security logs, support mail (and checked against Rule 8(3) and CERT-In log keeping) [COUNSEL]
- [ ] **Processors** listed with contracts: hosting (data-centre country), email sender, Google/Apple sign-in, YouTube, affiliate networks, analytics, error logging
- [ ] **Age policy** chosen and built (18+ with declaration, or verifiable parental consent)
- [ ] **Affiliate partners** listed; each programme's disclosure rule read
- [ ] **Which profile fields are enabled** (recommended: none beyond name until a purpose is documented)
- [ ] **Fake like counts** removed or replaced (see §3)
- [ ] Complaint handling tested end to end: email in, acknowledgement within 24 hours, tracked ticket, answer
- [ ] Moderation procedure written; reviewers trained; rejection reasons templated
- [ ] "Report this deal" and "Report this comment" buttons live
- [ ] Account deletion and data export route live
- [ ] Consent banner reviewed against Cookie Policy §6; consent log works
- [ ] Footer links: Privacy, Terms, Affiliate Disclosure, Cookie settings, Contact and grievance, Community Guidelines
- [ ] Breach runbook written and a drill done
- [ ] Counsel review of every [COUNSEL] item (next section)
- [ ] Effective dates and "last updated" dates filled in; version archive created

---

## 8. E. Questions for Indian counsel

1. **Classification under consumer law.** Is MetaDeals4U an "e-commerce entity" (marketplace or inventory), or only a publisher/affiliate advertiser, for the Consumer Protection Act, 2019 and the E-Commerce Rules, 2020? Does the affiliate click-out "facilitate transactions"? Does it matter that the site shows "Buy Now" buttons and tracks commissions?
2. **Classification under the CCPA guidelines.** Is MetaDeals an "advertiser", "endorser" or "platform" for the 2022 and 2023 guidelines? What disclosure wording and placement is expected for affiliate links?
3. **User-submitted retailer offers.** Can the site lawfully publish deals that **customers** submit about retailers' products? Questions: advertiser/seller status of the submitter; accuracy duty for MetaDeals once it approves; defamation or trade-mark risk; whether approving converts a submission into MetaDeals' own advertisement; use of retailer images submitted by customers.
4. **Intermediary status and safe harbour.** For comments and submissions, does section 79 protection apply given that staff review and publish submitted deals (editorial control)? What grievance-officer and takedown steps are needed under the IT Rules 2021 as amended in November 2025, and is a "resident" officer required?
5. **Mandatory officers.** Is a Grievance Officer mandatory (IT Rules; E-Commerce Rules if applicable; DPDP Rules 9 and 14)? Does an e-commerce entity need a registered Indian company or branch (E-Commerce Rules, r. 4(1))?
6. **DPDP applicability and timing.** Confirm the commencement dates (13 Nov 2026 and 13 May 2027) against the Gazette, any amendment compressing the timeline, and whether a start-up exemption exists or is notified.
7. **Rule 8(3) retention.** How does the one-year minimum retention of personal data, traffic data and logs interact with deletion promises, account deletion and short analytics retention?
8. **Consent model.** For anonymous page counts (daily rotating hash, no cookie): is consent needed, is a "legitimate use" available, or is the data not "personal data"? For the `md_v_*` view cookie: essential or consent-based?
9. **Children.** What age-assurance is reasonable for a deals site that bars under-18s? Is a self-declaration enough; does collecting date of birth create duties?
10. **Sensitive-data treatment.** Is date of birth or sex "sensitive" under the SPDI Rules (current law)? Confirm that passwords are SPDI and that a written-consent step is needed now.
11. **Cross-border.** Hosting location, Google/Apple sign-in transfers, YouTube embeds, and Rule 15 (restrictions the Government may specify).
12. **Liability clause.** Review the limitation-of-liability wording against the Indian Contract Act and the Consumer Protection Act's unfair-contract provisions; confirm the governing-law and jurisdiction placeholders.
13. **Commission disclosure wording.** Is the proposed wording at the buy button enough; must it appear in the ad itself?
14. **Cuelinks and Amazon-type programmes.** Does any network contract restrict or dictate the privacy or disclosure text?
15. **Retailer logos and product images.** Licence position for each retailer and for marketplace-sourced images.
16. **Telegram and WhatsApp posting.** Any consent needed to post deals (and any customer data) to channels?
17. **Tax and other filings** relating to commission income (outside this package).

---

## 9. Recommendation

**Publish first** (low risk, needed soon): the Privacy Policy, Terms of Use, Affiliate Disclosure, and the Contact and Grievance page with a **named officer and working email**. Add the footer links and the buy-button wording. Fix or remove the invented like counts first.

**Keep switched off until the matching process exists:** profile fields beyond name; session analytics and customer linking; advertising tools; user submissions and comments (until moderation and takedown work); mobile apps (until store declarations match); anything that touches under-18s.

**Counsel must review before any of it goes live:** questions 1 to 6 and 8 to 9 in §8 first, because they decide whether the E-Commerce Rules, intermediary duties and DPDP consent rules apply the way these drafts assume.

---

## 10. Sources and access dates (all accessed 12 November 2026)

**Primary and official**
- DPDP Rules, 2025, G.S.R. 846(E), 13 Nov 2025: official copy `https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf` (automated access blocked, 403); text read from a mirror `https://www.dpdpa.com/DPDP_Rules_2025_English_only.pdf` whose Gazette header (G.S.R. 846(E), 13 Nov 2025) and Rule 1 matched.
- DPDP Act, 2023 (Act 22 of 2023): India Code listing `https://www.indiacode.nic.in/handle/123456789/22037?view_type=browse` (listing only); section text read at `https://indiankanoon.org/doc/3510545/` (unofficial; page noted it pre-dated commencement).
- PIB release on the Rules (not readable by my tool): `https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf`.
- CCPA Guidelines page: `https://ccpa.doca.gov.in/guidelines.php`; Dark Patterns Guidelines 2023 PDF and Misleading Advertisements and Endorsements Guidelines 2022 PDF (`.../files/CCPA_Notification.pdf`), both **read in full**.
- MeitY IT Rules 2021 consolidated text: `https://www.meity.gov.in/static/uploads/2024/02/Information-Technology-Intermediary-Guidelines-and-Digital-Media-Ethics-Code-Rules-2021-updated-06.04.2023-.pdf` (blocked, 403; **not read**).
- Consumer Protection (E-Commerce) Rules, 2020, G.S.R. 462(E): official text on the Department of Consumer Affairs site not retrieved; read through reproductions such as `https://ibclaw.in/consumer-protection-e-commerce-rules-2020/` and `https://taxguru.in/corporate-law/consumer-protection-e-commerce-rules-2020.html` (**secondary**).

**Secondary (law-firm and compliance commentary; verify against the Gazette)**
- Commencement dates (G.S.R. 843(E)): `https://dpdprules.org/timeline`, `https://dpdpa.support/articles/dpdp-act-gsr-843e-enforcement-sections-technology-stack/`.
- Reported compression proposal: `https://www.legal500.com/intelligence/india/privacy/compression-of-dpdp-enforcement-timeline-proposed-by-meity`, `https://dpdprules.org/blog/dpdp-18-months-to-12-months-proposal`.
- SPDI Rules after the DPDP Act: `https://dpdprules.org/blog/spdi-rules-2011-and-the-dpdp-act`.
- IT Rules 2021 grievance timelines and the 2025 amendment: `https://www.legal500.com/intelligence/india/media-telecoms-it-entertainment/the-information-technology-intermediary-guidelines-and-digital-media-ethics-code-rules-2021-focusing-on-the-2023-amendment`, `https://indialegalnews.com/2025/11/15/it-intermediary-amended-rules-2025/`.
- CERT-In 2022 Directions: `https://www.tcsa.in/learn/cert-in-directions-2022-explained`.
- E-Commerce Rules definitions and duties: `https://www.legal500.com/intelligence/india/consumer-protection/the-consumer-protection-e-commerce-rules-2020`.

**Platform rules**
- Google Play Data safety: `https://support.google.com/googleplay/android-developer/answer/10787469`.
- Apple App Privacy Details and guideline 5.1.1: `https://developer.apple.com/app-store/app-privacy-details/` (not retrieved; described from secondary sources).

**Not found / not verified:** any notified amendment to the DPDP timeline or to the E-Commerce Rules after the 2021 draft; the 2026 synthetic-media amendment to the IT Rules mentioned by one source; the official Gazette texts of the commencement notification and the E-Commerce Rules. Counsel should check these directly.
