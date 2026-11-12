"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { SEX_LABELS, SEX_VALUES } from "./profile-validation";
import styles from "./profile.module.css";
import { IdentityCard, UserNamePrompt } from "./IdentityCard";

type Counts = { total: number; pendingReview: number; approvedAwaitingPublication: number; rejected: number; live: number };
type Profile = { name: string; email: string; sex: string | null; dateOfBirth: string | null; location: string | null; counts: Counts };
type Submission = {
  id: string; title: string; brand: string | null; description: string; productUrl: string; merchantName: string | null; categoryHint: string | null;
  priceMinor: number; mrpMinor: number | null; couponCode: string | null; version: number; submittedAt: string; rejectionReason: string | null;
  stage: "PENDING_REVIEW" | "APPROVED" | "LIVE" | "REJECTED"; dealSlug: string | null; imageUrl: string;
};
const STAGE_LABEL = { PENDING_REVIEW: "Awaiting review", APPROVED: "Approved, going live soon", LIVE: "Live on MetaDeals4U", REJECTED: "Not approved" } as const;
const emptyForm = { title: "", productUrl: "", merchantName: "", categoryHint: "", price: "", mrp: "", couponCode: "", brand: "", description: "" };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error ?? "Please try again.");
  return body as T;
}
/** Picks the shop category that matches the fetched category or, failing that, a word in the title. Empty when unsure, so the member chooses. */
function guessCategory(options: string[], ...texts: string[]) {
  const text = texts.join(" ").toLowerCase();
  const exact = options.find((o) => o.toLowerCase() === (texts[0] ?? "").toLowerCase());
  if (exact) return exact;
  const words = (name: string) => name.toLowerCase().replace(/&/g, " ").split(/[^a-z0-9]+/).filter((w) => w.length > 3).map((w) => w.replace(/s$/, ""));
  return options.find((o) => words(o).some((w) => text.includes(w))) ?? "";
}
const toMinor = (value: string) => Math.round(Number(value) * 100);

export function CustomerProfile({ section = "profile" }: { section?: "profile" | "deals" }) {
  const deals = section === "deals";
  const [profile, setProfile] = useState<Profile | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<Submission | null>(null);
  const [image, setImage] = useState<File | null>(null);
  const [fetched, setFetched] = useState<{ logoUrl?: string | null; store: string; images: string[]; notes: string[]; category: string; status: string } | null>(null);
  const [pickedImage, setPickedImage] = useState("");
  const [fetching, setFetching] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [submitMsg, setSubmitMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!deals) return;
    const onPaste = (e: ClipboardEvent) => { const f = Array.from(e.clipboardData?.files ?? []).find((x) => x.type.startsWith("image/")); if (f) setImage(f); };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [deals]);
  const [categories, setCategories] = useState<{ id: string; name: string; parentId: string | null }[]>([]);
  useEffect(() => {
    if (!deals) return;
    fetch("/api/v1/catalog").then((r) => r.json()).then((b) => setCategories(b?.data?.categories ?? b?.categories ?? [])).catch(() => {});
  }, [deals]);

  const refresh = useCallback(async () => {
    const [p, s] = await Promise.all([api<{ data: Profile }>("/api/v1/customer/profile"), api<{ data: Submission[]; counts: Counts }>("/api/v1/customer/submissions")]);
    setProfile({ ...p.data, counts: s.counts });
    setSubmissions(s.data);
  }, []);
  useEffect(() => {
    let alive = true;
    Promise.all([api<{ data: Profile }>("/api/v1/customer/profile"), api<{ data: Submission[]; counts: Counts }>("/api/v1/customer/submissions")])
      .then(([p, s]) => { if (alive) { setProfile({ ...p.data, counts: s.counts }); setSubmissions(s.data); } })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    setBusy(true);
    setProfileMsg(null);
    try {
      await api("/api/v1/customer/profile", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: values.name, sex: values.sex || null, dateOfBirth: values.dateOfBirth || null, location: values.location || null }),
      });
      await refresh();
      setProfileMsg({ ok: true, text: "Profile saved." });
    } catch (error) {
      setProfileMsg({ ok: false, text: error instanceof Error ? error.message : "Could not save." });
    } finally { setBusy(false); }
  }

  function startEdit(item: Submission) {
    setEditing(item);
    setImage(null);
    setSubmitMsg(null);
    setForm({
      title: item.title, productUrl: item.productUrl, merchantName: item.merchantName ?? "", categoryHint: item.categoryHint ?? "", price: String(item.priceMinor / 100),
      mrp: item.mrpMinor ? String(item.mrpMinor / 100) : "", couponCode: item.couponCode ?? "", brand: item.brand ?? "", description: item.description,
    });
    window.scrollTo({ top: document.getElementById("submit-deal")?.offsetTop ?? 0, behavior: "smooth" });
  }

  function resetDealForm() {
    setForm(emptyForm); setImage(null); setEditing(null); setFetched(null); setPickedImage(""); setSubmitMsg(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  // Same extractor as the admin "Fetch" button: fills the form from the store page; everything stays editable.
  async function fetchFromLink() {
    setSubmitMsg(null);
    const link = form.productUrl.trim().replace(/^http:\/\//i, "https://");
    if (!/^https:\/\//i.test(link)) return setSubmitMsg({ ok: false, text: "Paste the store's product link first (it must start with http:// or https://)." });
    setFetching(true);
    try {
      const body = await api<{ data: { logoUrl: string | null; status: string; store: string; productUrl: string; title: string; brand: string; description: string; priceRupees: string; mrpRupees: string; category: string; images: string[]; notes: string[] } }>(
        "/api/v1/customer/product-fetch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: link }) });
      const d = body.data;
      setForm((f) => ({ ...f, title: d.title || f.title, brand: d.brand || f.brand, description: d.description || f.description, price: d.priceRupees || f.price, mrp: d.mrpRupees || f.mrp, merchantName: d.store || f.merchantName, categoryHint: guessCategory(categories.map((c) => c.name), d.category, d.title, d.brand) || f.categoryHint, productUrl: d.productUrl || f.productUrl }));
      setFetched({ logoUrl: d.logoUrl, store: d.store, images: d.images, notes: d.notes, category: d.category, status: d.status });
      setPickedImage(d.images[0] ?? "");
      setSubmitMsg({ ok: true, text: d.title || d.priceRupees ? "Details fetched. Please check every field below before you submit." : "We could not read this page automatically. Please fill in the details yourself." });
    } catch (error) {
      setSubmitMsg({ ok: false, text: error instanceof Error ? error.message : "Could not fetch the details. Please fill them in yourself." });
    } finally { setFetching(false); }
  }

  async function submitDeal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setSubmitMsg(null);
    try {
      if (!editing && !image && !pickedImage) { setSubmitMsg({ ok: false, text: "Please upload a product picture, or fetch details and choose one." }); setBusy(false); return; }
      const data = {
        title: form.title, productUrl: form.productUrl.trim().replace(/^http:\/\//i, "https://"), description: form.description, priceMinor: toMinor(form.price),
        brand: form.brand || null, merchantName: form.merchantName || null, categoryHint: form.categoryHint || null,
        mrpMinor: form.mrp ? toMinor(form.mrp) : null, couponCode: form.couponCode || null,
        ...(!image && pickedImage ? { imageUrl: pickedImage } : {}),
      };
      const body = new FormData();
      body.set("data", JSON.stringify(data));
      if (image) body.set("image", image);
      if (editing) body.set("version", String(editing.version));
      await api(editing ? `/api/v1/customer/submissions/${editing.id}` : "/api/v1/customer/submissions", { method: editing ? "PATCH" : "POST", body });
      setForm(emptyForm); setImage(null); setEditing(null); setFetched(null); setPickedImage("");
      if (fileInput.current) fileInput.current.value = "";
      await refresh();
      setSubmitMsg({ ok: true, text: editing ? "Sent back for review." : "Thank you! Your deal was sent for review. It stays private until our team approves and publishes it." });
    } catch (error) {
      setSubmitMsg({ ok: false, text: error instanceof Error ? error.message : "Could not submit." });
    } finally { setBusy(false); }
  }

  const set = (key: keyof typeof emptyForm) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const selectedCat = categories.find((x) => x.name === form.categoryHint);
  const mainCat = selectedCat ? (selectedCat.parentId ? categories.find((x) => x.id === selectedCat.parentId) : selectedCat) : undefined;
  const subCats = mainCat ? categories.filter((x) => x.parentId === mainCat.id) : [];
  const c = profile?.counts;

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div><h1>{deals ? "Post a Deal" : "Your profile"}</h1><p className={styles.sub}>{profile?.email}</p></div>
        <div className={styles.actions}>
          {deals ? <Link href="/account" className={styles.secondary}>My profile</Link> : <Link href="/post-deal" className={styles.secondary}>Post a Deal</Link>}
          <Link href="/" className={styles.secondary}>Explore deals</Link>
          <button className={styles.secondary} onClick={() => void signOut({ callbackUrl: "/" })}>Sign out</button>
        </div>
      </div>

      <UserNamePrompt />
      {!deals && <IdentityCard />}

      <section className={styles.tiles} aria-label="Your deal submissions">
        <div className={styles.tile}><small>Submitted</small><strong>{c?.total ?? "–"}</strong></div>
        <div className={styles.tile}><small>Awaiting review</small><strong>{c?.pendingReview ?? "–"}</strong></div>
        <div className={styles.tile}><small>Not approved</small><strong>{c?.rejected ?? "–"}</strong></div>
        <div className={styles.tile}><small>Live</small><strong>{c?.live ?? "–"}</strong>{!!c?.approvedAwaitingPublication && <em>{c.approvedAwaitingPublication} approved, going live soon</em>}</div>
      </section>

      {!deals && <section className={styles.card}>
        <h2>About you</h2>
        {profile && (
          <form className={styles.form} onSubmit={saveProfile} key={profile.name + profile.sex + profile.dateOfBirth + profile.location}>
            <label>Name<input name="name" defaultValue={profile.name} required minLength={2} maxLength={80} /></label>
            <label>Sex (optional)
              <select name="sex" defaultValue={profile.sex ?? ""}><option value="">Not set</option>{SEX_VALUES.map((v) => <option key={v} value={v}>{SEX_LABELS[v]}</option>)}</select>
            </label>
            <label>Date of birth (optional)<input name="dateOfBirth" type="date" defaultValue={profile.dateOfBirth ?? ""} max={new Date().toISOString().slice(0, 10)} /></label>
            <label>City or state (optional)<input name="location" defaultValue={profile.location ?? ""} maxLength={100} placeholder="e.g. Chennai, Tamil Nadu" />
              <span className={styles.hint}>Type a place name yourself. We never read your device location.</span></label>
            <div className={`${styles.wide} ${styles.hint}`}>Sharing these is optional. See our <Link href="/privacy">privacy details</Link>.</div>
            <div className={`${styles.wide} ${styles.actions}`}>
              <button className={styles.primary} disabled={busy}>Save profile</button>
              {profileMsg && <span className={profileMsg.ok ? styles.ok : styles.err} role="status">{profileMsg.text}</span>}
            </div>
          </form>
        )}
      </section>}

      {deals && <section className={styles.card} id="submit-deal">
        <h2>{editing ? "Fix and resubmit your deal" : "Share a deal"}</h2>
        {editing?.rejectionReason && <p className={styles.reason}>Why it was not approved: {editing.rejectionReason}</p>}
        <form className={styles.form} onSubmit={submitDeal}>
          <div className={styles.wide} style={{ display: "grid", gap: 8 }}><label >Link to the product page (https)<input type="url" value={form.productUrl} onChange={set("productUrl")} required placeholder="https://www.store.com/product" /></label><div className={styles.actions}><button type="button" className={styles.primary} disabled={busy || fetching || !form.productUrl} onClick={() => void fetchFromLink()}>{fetching ? "Fetching…" : "Fetch details"}</button><button type="button" className={styles.secondary} disabled={busy || fetching} onClick={resetDealForm}>Reset</button><span className={styles.hint}>Paste a store link and we will fill in what we can find. You can change anything.</span></div></div>
          <label className={styles.wide}>Deal title<input value={form.title} onChange={set("title")} required minLength={3} maxLength={200} /></label>
          <label>Deal price (₹)<input inputMode="decimal" value={form.price} onChange={set("price")} required pattern="[0-9]+(\.[0-9]{1,2})?" /></label>
          <label>MRP (₹, optional)<input inputMode="decimal" value={form.mrp} onChange={set("mrp")} pattern="[0-9]+(\.[0-9]{1,2})?" /></label>
          <label>Store name (optional)<input value={form.merchantName} onChange={set("merchantName")} maxLength={100} /></label>
          <label>Main category<select value={mainCat?.name ?? ""} onChange={(e) => setForm((f) => ({ ...f, categoryHint: e.target.value }))} required><option value="">Choose a main category</option>{categories.filter((c) => !c.parentId).map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}</select></label>
          {subCats.length > 0 && <label>Sub category (optional)<select value={selectedCat?.parentId ? selectedCat.name : ""} onChange={(e) => setForm((f) => ({ ...f, categoryHint: e.target.value || mainCat?.name || "" }))}><option value="">Not sure / general</option>{subCats.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}</select></label>}
          <label>Brand (optional)<input value={form.brand} onChange={set("brand")} maxLength={100} /></label>
          <label>Coupon code (optional)<input value={form.couponCode} onChange={set("couponCode")} maxLength={50} /></label>
          <label className={styles.wide}>Description<textarea rows={4} value={form.description} onChange={set("description")} required minLength={10} maxLength={2000} /></label>
          {fetched && (
            <div className={`${styles.wide} ${styles.card}`} style={{ background: "#faf8ff" }} aria-label="Fetched details">
              <strong style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {fetched.logoUrl && <img src={fetched.logoUrl} alt="" height={24} style={{ maxHeight: 24, maxWidth: 90, objectFit: "contain" }} />}
                Fetched from {fetched.store || "the store page"}
              </strong>
              {fetched.images.length > 0 ? (
                <>
                  <div className={styles.hint}>Choose the product picture (or upload your own below):</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                    {fetched.images.map((src) => (
                      <button type="button" key={src} onClick={() => setPickedImage(src)} aria-pressed={pickedImage === src} style={{ border: pickedImage === src ? "2px solid #5b21d6" : "1px solid #d8d2f1", borderRadius: 8, padding: 2, background: "#fff", cursor: "pointer" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt="Product option" width={72} height={72} referrerPolicy="no-referrer" style={{ objectFit: "contain" }} />
                      </button>
                    ))}
                  </div>
                </>
              ) : <div className={styles.hint}>No picture found. Please upload one below.</div>}
              {fetched.notes.map((n) => <div key={n} className={styles.hint}>• {n}</div>)}
            </div>
          )}
          <div className={styles.wide} style={{ display: "grid", gap: 6 }}>
            <strong style={{ fontSize: 14 }}>Product image</strong>
            <div className={styles.actions}>
              <button type="button" className={styles.secondary} onClick={() => fileInput.current?.click()}>Upload picture</button>
              <span className={styles.hint}>{image ? `Selected: ${image.name}` : editing ? "Leave empty to keep the current one." : pickedImage ? "Optional: the picture chosen above is used otherwise." : "JPEG, PNG or WebP, up to 5 MB. You can also press Ctrl+V to paste a copied image."}</span>
            </div>
            <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => setImage(e.target.files?.[0] ?? null)} />
          </div>
          <div className={`${styles.wide} ${styles.hint}`}>Your deal is checked by our team before it appears. Only the details you choose to publish are shown; your email is never shown. Please share only real, current deals you have checked on the store page.</div>
          <div className={`${styles.wide} ${styles.actions}`}>
            <button className={styles.primary} disabled={busy}>{busy ? "Sending…" : editing ? "Resubmit for review" : "Submit for review"}</button>
            {editing && <button type="button" className={styles.secondary} onClick={() => { setEditing(null); setForm(emptyForm); }}>Cancel</button>}
            {submitMsg && <span className={submitMsg.ok ? styles.ok : styles.err} role="status">{submitMsg.text}</span>}
          </div>
        </form>
      </section>}

      {deals && <section className={styles.card} id="my-submissions">
        <h2>My submissions</h2>
        <div className={styles.list}>
          {submissions.map((s) => (
            <article className={styles.item} key={s.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.imageUrl} alt="" />
              <div>
                <h3>{s.title}</h3>
                <span className={`${styles.stage} ${styles[s.stage]}`}>{STAGE_LABEL[s.stage]}</span>
                <div className={styles.sub}>₹{(s.priceMinor / 100).toLocaleString("en-IN")} · sent {new Date(s.submittedAt).toLocaleDateString("en-IN")}</div>
                {s.stage === "REJECTED" && <p className={styles.reason}>{s.rejectionReason}</p>}
                <div className={styles.actions} style={{ marginTop: 8 }}>
                  {s.stage === "REJECTED" && <button className={styles.secondary} onClick={() => startEdit(s)}>Edit and resubmit</button>}
                  {s.dealSlug && <Link className={styles.secondary} href={`/deal/${s.dealSlug}`}>View live deal</Link>}
                </div>
              </div>
            </article>
          ))}
          {!submissions.length && <div className={styles.empty}>You have not shared a deal yet.</div>}
        </div>
      </section>}
    </div>
  );
}
