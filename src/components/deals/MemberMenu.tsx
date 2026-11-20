"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, Mail, Star, User, UserPlus } from "lucide-react";
import styles from "./DealExtras.module.css";

/** The little menu beside a member's name: Give Star, Follow User, Send Message, View Profile. Star and follow need a signed-in member (the server decides). */
export function MemberMenu({ handle, messaging, label }: { handle: string; messaging: boolean; label: string }) {
  const [open, setOpen] = useState(false);
  const [say, setSay] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const away = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("keydown", key); document.addEventListener("mousedown", away);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("mousedown", away); };
  }, [open]);

  async function act(path: "stars" | "follows", done: string) {
    setSay("");
    const response = await fetch(`/api/v1/customer/community/${path}/${encodeURIComponent(handle)}`, { method: "PUT" }).catch(() => null);
    if (response?.ok) setSay(done);
    else if (response?.status === 401) setSay("Please sign in first.");
    else setSay((await response?.json().catch(() => null))?.error ?? "That did not work. Try again.");
  }

  return (
    <div className={styles.memberMenu} ref={ref}>
      <button type="button" className={styles.memberName} aria-haspopup="menu" aria-expanded={open} onClick={() => { setOpen((o) => !o); setSay(""); }}>
        <strong>{label}</strong> <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div className={styles.menuList} role="menu">
          <button type="button" role="menuitem" onClick={() => void act("stars", "Star given.")}><Star size={18} aria-hidden="true" /> Give Star</button>
          <button type="button" role="menuitem" onClick={() => void act("follows", "You follow this member.")}><UserPlus size={18} aria-hidden="true" /> Follow User</button>
          {messaging && <Link role="menuitem" href={`/messages?to=${encodeURIComponent(handle)}`}><Mail size={18} aria-hidden="true" /> Send Message</Link>}
          <Link role="menuitem" href={`/community/u/${encodeURIComponent(handle)}`}><User size={18} aria-hidden="true" /> View Profile</Link>
          {say && <p role="status" className={styles.menuSay}>{say}{say === "Please sign in first." && <> <Link href="/account">Sign in</Link></>}</p>}
        </div>
      )}
    </div>
  );
}
