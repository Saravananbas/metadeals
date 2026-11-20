"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import styles from "./DealExtras.module.css";

/** A promo code with a Copy button. */
export function CouponChip({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked: the code stays visible to copy by hand */ }
  }
  return (
    <div className={styles.coupon}>
      <span className={styles.code} aria-label={`Promo code ${code}`}>{code}</span>
      <button type="button" className={styles.copy} onClick={() => void copy()}>
        {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
        <span aria-live="polite">{copied ? "Copied" : "Copy code"}</span>
      </button>
    </div>
  );
}
