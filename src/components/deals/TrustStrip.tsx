import { ShieldCheck, TrendingDown, Store, Lock } from "lucide-react";
import styles from "@/app/deal/[slug]/deal-detail.module.css";

export function TrustStrip() {
  const TRUST_ITEMS = [
    {
      icon: ShieldCheck,
      title: "Verified Deals",
      text: "Real price drops verified against historical retail benchmarks.",
    },
    {
      icon: TrendingDown,
      title: "Compare & Save",
      text: "Unbiased comparisons across Amazon, Flipkart, Croma and more.",
    },
    {
      icon: Store,
      title: "Trusted Retailers",
      text: "We only link to authorized Indian stores and official brand sellers.",
    },
    {
      icon: Lock,
      title: "Secure Shopping",
      text: "Direct checkout on retailer's official secure payment gateway.",
    },
  ];

  return (
    <div className={styles.trustStrip}>
      <div className={styles.trustGrid}>
        {TRUST_ITEMS.map((item, idx) => {
          const Icon = item.icon;
          return (
            <div key={idx} className={styles.trustItem}>
              <div className={styles.trustIconBox}>
                <Icon size={22} strokeWidth={2.2} />
              </div>
              <div>
                <h4 className={styles.trustTitle}>{item.title}</h4>
                <p className={styles.trustText}>{item.text}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

