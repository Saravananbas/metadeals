"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import styles from "./profile.module.css";

type Own = { handle: string; displayName: string | null; bio: string | null; location: string | null; avatarUrl: string | null };
const MAX_PHOTO = 2 * 1024 * 1024, OUT = 512;

/** Square crop: drag to move, slider to zoom. The server re-encodes whatever arrives, so this is only for choosing the framing. */
function PhotoCrop({ file, onDone, onCancel }: { file: File; onDone: (blob: Blob) => void; onCancel: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null), image = useRef<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1), [offset, setOffset] = useState({ x: 0, y: 0 }), [ready, setReady] = useState(false);
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { image.current = img; setReady(true); };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const draw = useCallback(() => {
    const c = canvas.current, img = image.current;
    if (!c || !img) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    const scale = (OUT / Math.min(img.width, img.height)) * zoom, w = img.width * scale, h = img.height * scale;
    // The picture can never be dragged so far that an empty edge shows.
    const x = Math.min(0, Math.max(OUT - w, (OUT - w) / 2 + offset.x)), y = Math.min(0, Math.max(OUT - h, (OUT - h) / 2 + offset.y));
    ctx.clearRect(0, 0, OUT, OUT); ctx.drawImage(img, x, y, w, h);
  }, [zoom, offset]);
  useEffect(() => { if (ready) draw(); }, [ready, draw]);

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drag.current) return;
    const k = OUT / e.currentTarget.getBoundingClientRect().width, dx = (e.clientX - drag.current.x) * k, dy = (e.clientY - drag.current.y) * k;
    drag.current = { x: e.clientX, y: e.clientY };
    setOffset((o) => ({ x: o.x + dx, y: o.y + dy }));
  };
  return (
    <div className={styles.crop}>
      <canvas ref={canvas} width={OUT} height={OUT} aria-label="Drag to position your photo"
        onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} />
      <label className={styles.hint}>Zoom <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} aria-label="Zoom" /></label>
      <div className={styles.row}>
        <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} disabled={!ready} onClick={() => canvas.current?.toBlob((b) => { if (b) onDone(b); }, "image/jpeg", 0.9)}>Use this photo</button>
        <button type="button" className={styles.btn} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export function EditProfile() {
  const router = useRouter();
  const [own, setOwn] = useState<Own | null>(null), [loadError, setLoadError] = useState("");
  const [handle, setHandle] = useState(""), [displayName, setDisplayName] = useState(""), [bio, setBio] = useState(""), [location, setLocation] = useState("");
  const [check, setCheck] = useState<{ ok: boolean; text: string } | null>(null);
  const [say, setSay] = useState<{ ok: boolean; text: string } | null>(null), [saving, setSaving] = useState(false);
  const [pick, setPick] = useState<File | null>(null), [photoSay, setPhotoSay] = useState<{ ok: boolean; text: string } | null>(null), [photoBusy, setPhotoBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/v1/customer/community/profile", { cache: "no-store" }).then(async (r) => {
      const b = await r.json().catch(() => null);
      if (!r.ok) { setLoadError(b?.error ?? "Could not load your profile."); return; }
      const d: Own = b.data; setOwn(d); setHandle(d.handle); setDisplayName(d.displayName ?? ""); setBio(d.bio ?? ""); setLocation(d.location ?? "");
    }).catch(() => setLoadError("Could not load your profile."));
  }, []);

  // User name availability, checked shortly after typing stops.
  const typed = handle.trim().toLowerCase();
  useEffect(() => {
    if (!own || typed === own.handle) return;
    const timer = setTimeout(() => {
      fetch(`/api/v1/customer/identity/available?handle=${encodeURIComponent(typed)}`, { cache: "no-store" }).then((r) => r.json()).then((b) => {
        if (b?.data) setCheck(b.data.available ? { ok: true, text: "This user name is available." } : { ok: false, text: b.data.reason });
      }).catch(() => setCheck(null));
    }, 350);
    return () => clearTimeout(timer);
  }, [typed, own]);
  const shownCheck = own && typed !== own.handle ? check : null;

  async function upload(blob: Blob) {
    setPick(null); setPhotoBusy(true); setPhotoSay(null);
    const form = new FormData(); form.append("image", blob, "photo.jpg");
    try {
      const r = await fetch("/api/v1/customer/identity/avatar", { method: "POST", body: form }), b = await r.json().catch(() => null);
      if (r.ok) { setOwn((o) => (o ? { ...o, avatarUrl: `${b.data.avatarUrl}?v=${Date.now()}` } : o)); setPhotoSay({ ok: true, text: "Photo updated." }); }
      else setPhotoSay({ ok: false, text: b?.error ?? "Could not upload the photo." });
    } catch { setPhotoSay({ ok: false, text: "Could not upload the photo." }); }
    setPhotoBusy(false);
  }
  function choose(file: File | undefined) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setPhotoSay({ ok: false, text: "Use a JPEG, PNG or WebP picture." }); return; }
    if (file.size > 8 * 1024 * 1024) { setPhotoSay({ ok: false, text: "That picture is too large. Choose one under 8 MB." }); return; }
    setPhotoSay(null); setPick(file);
  }
  async function removePhoto() {
    setPhotoBusy(true);
    const r = await fetch("/api/v1/customer/identity/avatar", { method: "DELETE" }).catch(() => null);
    if (r?.ok) { setOwn((o) => (o ? { ...o, avatarUrl: null } : o)); setPhotoSay({ ok: true, text: "Photo removed." }); } else setPhotoSay({ ok: false, text: "Could not remove the photo." });
    setPhotoBusy(false);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setSay(null);
    try {
      const r = await fetch("/api/v1/customer/community/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handle: typed, displayName: displayName || null, bio: bio || null, location: location || null }) });
      const b = await r.json().catch(() => null);
      if (r.ok) { setOwn(b.data); setHandle(b.data.handle); setSay({ ok: true, text: "Your profile was saved." }); router.refresh(); }
      else setSay({ ok: false, text: b?.error ?? "Could not save your profile." });
    } catch { setSay({ ok: false, text: "Could not save your profile. Check your connection and try again." }); }
    setSaving(false);
  }

  if (loadError) return <div className={`${styles.card} ${styles.form}`}><p className={styles.hintErr} role="alert">{loadError}</p><Link href="/account" className={styles.btn}>Go to your account</Link></div>;
  if (!own) return <div className={`${styles.card} ${styles.form}`}><p className={styles.hint}>Loading your profile…</p></div>;

  return (
    <>
      <form className={`${styles.card} ${styles.form}`} onSubmit={save}>
        <h1>Edit Profile</h1>
        <div className={styles.photo}>
          {pick ? <PhotoCrop file={pick} onDone={(b) => { if (b.size > MAX_PHOTO) setPhotoSay({ ok: false, text: "The picture must be 2 MB or smaller." }); else void upload(b); }} onCancel={() => setPick(null)} /> : (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {own.avatarUrl ? <img className={styles.avatar} src={own.avatarUrl} alt="Your profile photo" /> : <span className={styles.avatar} aria-hidden>{own.handle.slice(0, 1).toUpperCase()}</span>}
              <div className={styles.row}>
                <button type="button" className={styles.btn} disabled={photoBusy} onClick={() => fileInput.current?.click()}><Camera size={16} aria-hidden /> {own.avatarUrl ? "Change photo" : "Add photo"}</button>
                {own.avatarUrl && <button type="button" className={`${styles.btn} ${styles.btnQuiet}`} disabled={photoBusy} onClick={() => void removePhoto()}>Remove</button>}
              </div>
              <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ""; }} />
              <span className={styles.hint}>JPEG, PNG or WebP. You can position it before it is saved.</span>
            </>
          )}
          {photoSay && <span className={`${styles.hint} ${photoSay.ok ? styles.hintOk : styles.hintErr}`} role="status">{photoSay.text}</span>}
        </div>

        <label className={styles.field}>Display Name
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60} autoComplete="nickname" placeholder="Shown under your user name (optional)" />
        </label>
        <label className={styles.field}>Username
          <input value={handle} onChange={(e) => setHandle(e.target.value)} maxLength={30} autoCapitalize="none" autoCorrect="off" spellCheck={false} required aria-describedby="handle-hint" />
          <span id="handle-hint" className={`${styles.hint} ${shownCheck ? (shownCheck.ok ? styles.hintOk : styles.hintErr) : ""}`} role="status">{shownCheck?.text ?? "3 to 30 letters, numbers or underscores. This is your public name and profile address."}</span>
        </label>
        <label className={styles.field}>Bio
          <textarea rows={3} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={280} placeholder="A line or two about you (optional)" />
          <span className={styles.hint}>{bio.length}/280</span>
        </label>
        <label className={styles.field}>City / State
          <input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={80} autoComplete="address-level2" placeholder="Optional, shown on your public profile" />
        </label>
        <button className={`${styles.btn} ${styles.btnPrimary}`} disabled={saving || Boolean(shownCheck && !shownCheck.ok)}>{saving ? "Saving…" : "Save Changes"}</button>
        {say && <span className={`${styles.hint} ${say.ok ? styles.hintOk : styles.hintErr}`} role="status" style={{ textAlign: "center" }}>{say.text}</span>}
      </form>
      <div className={`${styles.card} ${styles.links}`}>
        <Link href={`/community/u/${own.handle}`}>View my public profile</Link>
        <Link href="/account">Account settings (email, password and security)</Link>
        <span className={styles.hint}>Your email, password and sign-in details are never shown on your public profile.</span>
      </div>
    </>
  );
}
