"use client";

import { useEffect, useState } from "react";
import styles from "./DealExtras.module.css";

/** Appears at the top once the main Buy Now button scrolls out of view, so shoppers can buy without scrolling back up. */
export function StickyBuyBar({ title, price, merchantName, imageUrl, href }: { title: string; price: string; merchantName: string; imageUrl: string; href: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const target = document.getElementById("buy-now-btn");
    if (!target || typeof IntersectionObserver === "undefined") return;
    // The sticky site header covers the top ~110px, so a button under it counts as gone. Not shown while the button is still below the fold.
    const observer = new IntersectionObserver(([entry]) => setShow(!entry.isIntersecting && entry.boundingClientRect.bottom < 110), { rootMargin: "-110px 0px 0px 0px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);
  return (
    <div className={`${styles.sticky} ${show ? styles.stickyShown : ""}`} aria-hidden={!show}>
      <div className={styles.stickyInner}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.stickyThumb} src={imageUrl} alt="" width={40} height={40} loading="lazy" />
        <div className={styles.stickyTitle}><strong>{title}</strong><span>at {merchantName}</span></div>
        <span className={styles.stickyPrice}>{price}</span>
        <a className={styles.stickyBuy} href={href} target="_blank" rel="sponsored noopener noreferrer" tabIndex={show ? 0 : -1}>Buy Now</a>
      </div>
    </div>
  );
}
