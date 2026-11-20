"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, Plus, Check, Star } from "lucide-react";
import styles from "./DealExtras.module.css";

type Viewer = { isOwner: boolean; signedIn: boolean; following: boolean; starred: boolean };

/** Follow, Give Star and Message for the poster. Hidden for the poster themself; a visitor is asked to sign in. */
export function PosterActions({ handle, viewer, messaging }: { handle: string; viewer: Viewer; messaging: boolean }) {
  const [following, setFollowing] = useState(viewer.following);
  const [starred, setStarred] = useState(viewer.starred);
  const [say, setSay] = useState("");
  if (viewer.isOwner) return null;

  async function toggle(path: "follows" | "stars", on: boolean, set: (v: boolean) => void) {
    if (!viewer.signedIn) { setSay("Please sign in first."); return; }
    setSay(""); set(!on);
    const response = await fetch(`/api/v1/customer/community/${path}/${encodeURIComponent(handle)}`, { method: on ? "DELETE" : "PUT" }).catch(() => null);
    if (!response?.ok) { set(on); setSay((await response?.json().catch(() => null))?.error ?? "That did not work. Try again."); }
  }

  return (
    <>
      <button type="button" className={styles.chip} aria-pressed={following} onClick={() => void toggle("follows", following, setFollowing)}>
        {following ? <Check size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />} {following ? "Following" : "Follow"}
      </button>
      <button type="button" className={styles.chip} aria-pressed={starred} onClick={() => void toggle("stars", starred, setStarred)}>
        <Star size={16} fill={starred ? "currentColor" : "none"} aria-hidden="true" /> {starred ? "Starred" : "Give Star"}
      </button>
      {messaging && <Link className={styles.chip} href={viewer.signedIn ? `/messages?to=${encodeURIComponent(handle)}` : "/account"}><Mail size={16} aria-hidden="true" /> Message</Link>}
      {say && <span className={styles.say} role="status">{say}{!viewer.signedIn && <> <Link href="/account">Sign in</Link></>}</span>}
    </>
  );
}
