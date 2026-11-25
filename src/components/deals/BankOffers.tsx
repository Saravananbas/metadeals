import { formatPaise } from "@/features/deals/currency";
import { bestOffer, offerHeadline, offerSavingMinor, offerWith, type BankOfferView } from "@/features/deals/bank-offers";
import { BankLogo } from "./BankLogo";
import styles from "./BankOffers.module.css";

/** The deal page's bank offers: each offer with its terms, and the effective price after the best one (shown apart from the real price). */
export function BankOffers({ offers, priceMinor }: { offers: BankOfferView[]; priceMinor: number }) {
  if (!offers.length) return null;
  const best = bestOffer(offers, priceMinor);
  return (
    <section className={styles.wrap} aria-labelledby="bank-offers-title">
      <h3 id="bank-offers-title">Bank offers</h3>
      {best && <p className={styles.effective}>Effective price <strong>{formatPaise(best.effectiveMinor)}</strong> with {offerWith(best.offer)}</p>}
      <ul className={`${styles.list} ${offers.length > 1 ? styles.two : ""}`}>
        {offers.map((o) => (
          <li key={o.id} className={styles.item}>
            <BankLogo name={o.bankName} logoUrl={o.bankLogoUrl} size={36} />
            <div>
              <strong>{offerHeadline(o)}</strong> with {offerWith(o)}
              <div className={styles.meta}>
                {o.schedule ? <span>{o.schedule}</span> : null}
                {o.minOrderMinor ? <span>Min. order {formatPaise(o.minOrderMinor)}</span> : null}
                {o.code ? <span>Code <b>{o.code}</b></span> : null}
                {o.validUntil ? <span>Valid till {new Date(o.validUntil).toLocaleDateString("en-IN", { dateStyle: "medium" })}</span> : null}
                {o.minOrderMinor && offerSavingMinor(o, priceMinor) === 0 ? <span>Not applicable at this price</span> : null}
              </div>
              {o.terms ? <div className={styles.terms}>{o.terms}</div> : null}
            </div>
          </li>
        ))}
      </ul>
      <p className={styles.note}>Bank offers are set by the banks and can change or end without notice. Check the offer on the store at checkout.</p>
    </section>
  );
}
