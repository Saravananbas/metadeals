"use client";

import { useEffect, useRef } from "react";
import { DISLIKE_REASONS, type DislikeReason } from "@/features/deals/vote-reasons";
import styles from "./DealExtras.module.css";

/** "Why are you downvoting this deal?" Choosing a reason sends the vote straight away. Escape or a click outside closes it. */
export function DislikeMenu({ onPick, onClose }: { onPick: (reason: DislikeReason) => void; onClose: () => void }) {
  const ref = useRef<HTMLFieldSetElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLInputElement>("input")?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const away = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("keydown", key);
    document.addEventListener("mousedown", away);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("mousedown", away); };
  }, [onClose]);
  return (
    <fieldset ref={ref} className={styles.dislikeMenu} onClick={(e) => e.stopPropagation()}>
      <legend>Why are you downvoting this deal?</legend>
      {DISLIKE_REASONS.map((reason) => (
        <label key={reason}><input type="radio" name="dislike-reason" value={reason} onChange={() => onPick(reason)} /> {reason}</label>
      ))}
    </fieldset>
  );
}
