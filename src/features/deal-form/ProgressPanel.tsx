import { Check } from "lucide-react";
import styles from "@/features/customer/profile.module.css";

type Values = { productUrl: string; title: string; price: string; mrp: string; description: string; categoryHint: string; merchantName: string; brand: string; hasImage: boolean };
const STEPS: { key: string; label: string; tip: string; done: (v: Values) => boolean }[] = [
  { key: "url", label: "Deal URL", tip: "Paste the store's product link. We read the page and fill in the rest.", done: (v) => /^https?:\/\//i.test(v.productUrl.trim()) },
  { key: "title", label: "Deal Title", tip: "Say what it is and the price, for example 'Boat Rockerz 450 headphones at ₹1,299'.", done: (v) => v.title.trim().length >= 3 },
  { key: "price", label: "Sale Price", tip: "The price a buyer pays now, after any discount.", done: (v) => Number(v.price) > 0 },
  { key: "mrp", label: "List Price", tip: "The MRP or usual price. It lets us show the discount.", done: (v) => Number(v.mrp) > 0 },
  { key: "description", label: "Description", tip: "Add offer terms, coupons or bank offers, validity, and any steps needed to get the deal.", done: (v) => v.description.trim().length >= 10 },
  { key: "category", label: "Category", tip: "Pick the closest category so people can find it.", done: (v) => Boolean(v.categoryHint) },
  { key: "store", label: "Store", tip: "The shop selling it.", done: (v) => Boolean(v.merchantName.trim()) },
  { key: "brand", label: "Brand", tip: "The maker of the product (optional but helps search).", done: (v) => Boolean(v.brand.trim()) },
  { key: "images", label: "Images", tip: "Choose a clear product picture, or upload one.", done: (v) => v.hasImage },
];

/** "Complete Your Deal": a ring with the percentage and a tick for each part of the form. The first unfinished step shows its tip. */
export function ProgressPanel({ values, compact = false }: { values: Values; compact?: boolean }) {
  const done = STEPS.map((s) => s.done(values));
  const percent = Math.round((done.filter(Boolean).length / STEPS.length) * 100);
  const active = done.findIndex((d) => !d);
  const radius = 54, circumference = 2 * Math.PI * radius;
  if (compact) return (
    <div className={styles.progressBar} role="progressbar" aria-label="Deal completeness" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
      <span style={{ width: `${percent}%` }} /><b>{percent}% complete</b>
    </div>
  );
  return (
    <section className={`${styles.sideCard} ${styles.progressPanel}`} aria-label="Complete your deal">
      <h2>Complete Your Deal</h2>
      <p className={styles.hint}>Be as detailed as possible so your deal is easier to find.</p>
      <div className={styles.ring} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Deal completeness">
        <svg viewBox="0 0 128 128" aria-hidden="true"><circle cx="64" cy="64" r={radius} className={styles.ringTrack} /><circle cx="64" cy="64" r={radius} className={styles.ringFill} strokeDasharray={circumference} strokeDashoffset={circumference * (1 - percent / 100)} transform="rotate(-90 64 64)" /></svg>
        <b>{percent}%</b>
      </div>
      <ol className={styles.steps}>
        {STEPS.map((s, i) => (
          <li key={s.key} className={done[i] ? styles.stepDone : i === active ? styles.stepActive : undefined}>
            <span className={styles.stepNo} aria-hidden="true">{done[i] ? <Check size={13} /> : i + 1}</span>
            <span>{s.label}</span>
            {i === active && <small>{s.tip}</small>}
          </li>
        ))}
      </ol>
    </section>
  );
}
