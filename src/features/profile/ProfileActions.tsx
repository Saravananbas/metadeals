"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Ban, Link2, MessageCircle, Pencil, Settings, UserCheck, UserPlus } from "lucide-react";
import { ReportButton } from "@/features/community/components/PostActions";
import styles from "./profile.module.css";

/** Copies the member's public address. */
export function CopyProfileLink({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(location.origin + path); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard not allowed: the address is still visible */ } }}>
      <Link2 size={15} aria-hidden /> {copied ? "Link copied" : path.replace(/^\//, "")}
    </button>
  );
}

/** Buttons on a member page: the owner edits; another signed-in member can message, report or block. */
export function ProfileActions({ handle, isOwner, signedIn, messaging, following: startsFollowing = false }: { handle: string; isOwner: boolean; signedIn: boolean; messaging: boolean; following?: boolean }) {
  const [following, setFollowing] = useState(startsFollowing);
  const [blocked, setBlocked] = useState<boolean | null>(null), [canMessage, setCanMessage] = useState(true), [say, setSay] = useState<{ ok: boolean; text: string } | null>(null), [busy, setBusy] = useState(false);
  useEffect(() => {
    if (isOwner || !signedIn || !messaging) return;
    let alive = true;
    fetch(`/api/v1/messages/with/${handle}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((b) => { if (alive && b) { setBlocked(b.data.iBlocked); setCanMessage(b.data.canMessage); } }).catch(() => {});
    return () => { alive = false; };
  }, [handle, isOwner, signedIn, messaging]);

  if (isOwner) return (
    <div className={styles.actions}>
      <Link href="/account?edit=1" className={styles.btn}><Pencil size={16} aria-hidden /> Edit Profile</Link>
      <Link href="/account?tab=settings" className={styles.btn}><Settings size={16} aria-hidden /> Account Settings</Link>
    </div>
  );

  async function toggleFollow() {
    const next = !following;
    setBusy(true); setSay(null); setFollowing(next); // shown at once, undone if the server refuses
    try {
      const r = await fetch(`/api/v1/customer/community/follows/${handle}`, { method: next ? "PUT" : "DELETE" });
      if (!r.ok) { setFollowing(!next); setSay({ ok: false, text: (await r.json().catch(() => null))?.error ?? "Could not update follow." }); }
    } catch { setFollowing(!next); setSay({ ok: false, text: "Could not update follow." }); }
    setBusy(false);
  }

  async function toggleBlock() {
    const next = !blocked;
    if (next && !window.confirm(`Block ${handle}? They will not be able to message you, and you will not be able to message them.`)) return;
    setBusy(true); setSay(null);
    try {
      const r = await fetch(`/api/v1/messages/blocks/${handle}`, { method: next ? "PUT" : "DELETE" });
      if (r.ok) { setBlocked(next); setCanMessage(!next); if (next) setFollowing(false); setSay({ ok: true, text: next ? "Member blocked." : "Member unblocked." }); }
      else setSay({ ok: false, text: (await r.json().catch(() => null))?.error ?? "Could not update the block." });
    } catch { setSay({ ok: false, text: "Could not update the block." }); }
    setBusy(false);
  }

  return (
    <div className={styles.actions}>
      {messaging && (signedIn
        ? canMessage && <Link href={`/messages?to=${handle}`} className={`${styles.btn} ${styles.btnPrimary}`}><MessageCircle size={16} aria-hidden /> Message</Link>
        : <Link href="/account" className={`${styles.btn} ${styles.btnPrimary}`}><MessageCircle size={16} aria-hidden /> Sign in to message</Link>)}
      {signedIn && canMessage && <button type="button" className={`${styles.btn} ${following ? styles.btnQuiet : ""}`} disabled={busy} aria-pressed={following} onClick={() => void toggleFollow()}>{following ? <UserCheck size={16} aria-hidden /> : <UserPlus size={16} aria-hidden />} {following ? "Following" : "Follow"}</button>}
      {signedIn && messaging && blocked !== null && <button type="button" className={`${styles.btn} ${styles.btnQuiet}`} disabled={busy} onClick={() => void toggleBlock()}><Ban size={16} aria-hidden /> {blocked ? "Unblock" : "Block"}</button>}
      {signedIn && <ReportButton targetType="PROFILE" targetId={handle} />}
      {say && <span className={`${styles.say} ${say.ok ? "" : styles.sayErr}`} role="status">{say.text}</span>}
    </div>
  );
}
