"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import styles from "./DealExtras.module.css";

export type DealTab = { key: string; label: string; content: ReactNode };

/** Accessible tabs (arrow keys, Home and End). The tab bar scrolls sideways on a phone. */
export function DealTabs({ tabs }: { tabs: DealTab[] }) {
  const [active, setActive] = useState(0);
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  function onKey(event: KeyboardEvent) {
    const last = tabs.length - 1;
    const next = event.key === "ArrowRight" ? (active + 1) % tabs.length : event.key === "ArrowLeft" ? (active + last) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? last : null;
    if (next === null) return;
    event.preventDefault();
    setActive(next);
    refs.current[next]?.focus();
  }
  return (
    <section className={styles.tabs}>
      <div className={styles.tabList} role="tablist" aria-label="Deal information" onKeyDown={onKey}>
        {tabs.map((t, i) => (
          <button key={t.key} ref={(el) => { refs.current[i] = el; }} type="button" role="tab" id={`${base}-t-${t.key}`} aria-selected={i === active} aria-controls={`${base}-p-${t.key}`} tabIndex={i === active ? 0 : -1} className={styles.tab} onClick={() => setActive(i)}>{t.label}</button>
        ))}
      </div>
      {tabs.map((t, i) => (
        <div key={t.key} role="tabpanel" id={`${base}-p-${t.key}`} aria-labelledby={`${base}-t-${t.key}`} hidden={i !== active} className={styles.panel}>{t.content}</div>
      ))}
    </section>
  );
}
