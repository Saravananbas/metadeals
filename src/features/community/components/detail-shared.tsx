"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Check, Copy, Flag, MessageCircle, Share2 } from "lucide-react";
import { REPORT_CATEGORIES, REPORT_LABELS } from "../validation";
import styles from "../detail.module.css";

/** A short link for sharing: /p/3fd33c (or /p/3fd33c.a8021e9 for one comment). Older discussions without the random ending keep their full address. */
export function shortPath(slug: string, commentId?: string) {
  const m = /-([0-9a-f]{6})$/.exec(slug);
  if (!m) return `/community/post/${slug}${commentId ? `#c-${commentId}` : ""}`;
  return `/p/${m[1]}${commentId ? `.${commentId.slice(-8)}` : ""}`;
}

/** Small message that disappears by itself; sign-in prompts come with a link. */
export function useToast() {
  const [toast, setToast] = useState<{ text: string; signIn?: boolean; ok?: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = (text: string, opts: { signIn?: boolean; ok?: boolean } = {}) => {
    setToast({ text, ...opts });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 4000);
  };
  const node = toast && (
    <div className={`${styles.toast} ${toast.ok ? styles.toastOk : ""}`} role="status">
      {toast.text} {toast.signIn && <Link href="/account">Sign in</Link>}
    </div>
  );
  return { show, node };
}

/** Calls a community API and turns the answer into one of: ok, needs sign-in, or an error message. */
export async function callApi(url: string, method: string, body?: unknown) {
  const response = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data: result?.data, error: (result?.error as string | undefined) ?? "Something went wrong. Please try again." };
}

/** A dropdown that closes when you click elsewhere or press Escape. */
export function Menu({ label, trigger, children, align = "right", bare = false }: { label: string; trigger: ReactNode; children: (close: () => void) => ReactNode; align?: "left" | "right"; bare?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div className={styles.menuWrap} ref={ref}>
      <button type="button" className={bare ? styles.bareBtn : styles.iconBtn} aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>{trigger}</button>
      {open && <div className={`${styles.menuPanel} ${align === "left" ? styles.menuLeft : ""}`} role="menu">{children(() => setOpen(false))}</div>}
    </div>
  );
}

/** Copy link, WhatsApp and the phone's own share sheet. The link never carries anything private. */
export function ShareMenu({ path, title, className, compact }: { path: string; title: string; className?: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const url = () => new URL(path, window.location.origin).href;
  const canNative = typeof navigator !== "undefined" && typeof navigator.share === "function";
  return (
    <Menu label="Share" align="left" bare trigger={<span className={className ?? styles.pillBtnInner}><Share2 size={compact ? 16 : 18} /> Share</span>}>
      {(close) => (
        <>
          <button type="button" role="menuitem" onClick={async () => { try { await navigator.clipboard.writeText(url()); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ } close(); }}>{copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "Link copied" : "Copy link"}</button>
          <a role="menuitem" href={`https://wa.me/?text=${encodeURIComponent(`${title} ${typeof window === "undefined" ? "" : url()}`)}`} target="_blank" rel="noopener noreferrer" onClick={close}><MessageCircle size={16} /> WhatsApp</a>
          {canNative && <button type="button" role="menuitem" onClick={async () => { close(); try { await navigator.share({ title, url: url() }); } catch { /* closed */ } }}><Share2 size={16} /> More options…</button>}
        </>
      )}
    </Menu>
  );
}

/** Report dialog: reasons come from the existing moderation system; the reporter stays private. */
export function ReportDialog({ targetType, targetId, onClose, onDone }: { targetType: "POST" | "COMMENT"; targetId: string; onClose: () => void; onDone: (text: string, ok: boolean, signIn?: boolean) => void }) {
  const [category, setCategory] = useState<(typeof REPORT_CATEGORIES)[number]>("SPAM");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; document.addEventListener("keydown", esc); return () => document.removeEventListener("keydown", esc); }, [onClose]);
  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Report to admin" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className={styles.dialog} onSubmit={async (e) => {
        e.preventDefault(); if (busy) return; setBusy(true);
        const r = await callApi("/api/v1/community/reports", "POST", { targetType, targetId, category, details: details.trim() || null });
        setBusy(false);
        if (r.ok) { onDone(r.data?.duplicate ? "You already reported this. Thank you." : "Thank you. Our team will look at it. Your report is private.", true); onClose(); }
        else onDone(r.status === 401 ? "Please sign in to report." : r.error, false, r.status === 401);
      }}>
        <h2><Flag size={20} /> Report to Admin</h2>
        <label>What is wrong?
          <select value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>{REPORT_CATEGORIES.map((c) => <option key={c} value={c}>{REPORT_LABELS[c]}</option>)}</select>
        </label>
        <label>More detail (optional)<textarea rows={3} maxLength={500} value={details} onChange={(e) => setDetails(e.target.value)} /></label>
        <p className={styles.hint}>Reports go to our moderators only. The person you report is never told who reported them.</p>
        <div className={styles.dialogActions}>
          <button type="button" className={styles.ghost} onClick={onClose}>Cancel</button>
          <button className={styles.primary} disabled={busy}>{busy ? "Sending…" : "Send report"}</button>
        </div>
      </form>
    </div>
  );
}
