"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { Check, Compass, Hourglass, Megaphone, Radio, Send, X } from "lucide-react";
import { SEX_LABELS, SEX_VALUES } from "./profile-validation";
import styles from "./profile.module.css";
import { IdentityCard, UserNamePrompt } from "./IdentityCard";
import { ProgressPanel } from "@/features/deal-form/ProgressPanel";
import { SameLinkNotice, SimilarDeals, useDealCheck } from "@/features/deal-form/SimilarDeals";
import { PreviewDialog } from "@/features/deal-form/PreviewDialog";
import { RichEditor } from "@/features/community/components/RichEditor";
import { htmlToPlain, textToHtml } from "@/features/deal-form/text";

type Counts = { total: number; pendingReview: number; approvedAwaitingPublication: number; rejected: number; live: number };
type Profile = { name: string; email: string; sex: string | null; dateOfBirth: string | null; location: string | null; counts: Counts };
type Submission = {
  id: string; title: string; brand: string | null; description: string; descriptionHtml?: string | null; productUrl: string; merchantName: string | null; categoryHint: string | null;
  priceMinor: number; mrpMinor: number | null; couponCode: string | null; version: number; submittedAt: string; rejectionReason: string | null;
  stage: "PENDING_REVIEW" | "APPROVED" | "LIVE" | "REJECTED"; dealState?: "LIVE" | "EXPIRED" | "ARCHIVED" | null; dealSlug: string | null; imageUrl: string;
};
type MerchantWebsite = { id: string; name: string; domain: string; logoUrl: string | null };
const STAGE_LABEL = { PENDING_REVIEW: "Awaiting review", APPROVED: "Approved, going live soon", LIVE: "Live on MetaDeals4U", REJECTED: "Not approved" } as const;
type Picture = { id: string } & ({ kind: "url"; url: string } | { kind: "file"; file: File; preview: string });
const MAX_PICTURES = 10;
const newId = () => Math.random().toString(36).slice(2);
const proxied = (src: string) => `/api/v1/customer/image-proxy?src=${encodeURIComponent(src)}`;
const emptyForm = { title: "", productUrl: "", merchantName: "", categoryHint: "", price: "", mrp: "", couponCode: "", brand: "", description: "", descriptionHtml: "" };

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
function websiteForUrl(raw: string, websites: MerchantWebsite[]) {
  try {
    const host = new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
    return [...websites].sort((a, b) => b.domain.length - a.domain.length).find((item) => {
      const domain = item.domain.toLowerCase().replace(/^www\./, "");
      return host === domain || host.endsWith(`.${domain}`);
    }) ?? null;
  } catch { return null; }
}
const toMinor = (value: string) => Math.round(Number(value) * 100);

export function CustomerProfile({ section = "profile", embedded = false }: { section?: "profile" | "deals"; embedded?: boolean }) {
  const [filter, setFilter] = useState<"all" | "PENDING_REVIEW" | "APPROVED" | "LIVE" | "REJECTED" | "EXPIRED" | "ARCHIVED">("all");
  const deals = section === "deals";
  const [profile, setProfile] = useState<Profile | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<Submission | null>(null);
  // Up to 10 pictures; the first is the main one. Each is a link found on the product page or a file the member added.
  const [pictures, setPictures] = useState<Picture[]>([]);
  const image = pictures[0]?.kind === "file" ? pictures[0].file : null;
  const pickedImage = pictures[0]?.kind === "url" ? pictures[0].url : "";
  const uploadedPreview = pictures[0]?.kind === "file" ? pictures[0].preview : "";
  const [fetched, setFetched] = useState<{ logoUrl?: string | null; store: string; images: string[]; notes: string[]; category: string; status: string } | null>(null);
  const [fetching, setFetching] = useState(false);
  const [autoFilled, setAutoFilled] = useState<string[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editorHtml, setEditorHtml] = useState("");
  const [editorVersion, setEditorVersion] = useState(0);
  const lastAutoDescription = useRef("");
  const loadEditor = (html: string) => { setEditorHtml(html); setEditorVersion((v) => v + 1); };
  const lastAutoUrl = useRef("");
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [submitMsg, setSubmitMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!deals) return;
    const onPaste = (e: ClipboardEvent) => {
      const f = Array.from(e.clipboardData?.files ?? []).find((x) => x.type.startsWith("image/"));
      if (!f) return;
      addFile(f);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [deals]);
  const [categories, setCategories] = useState<{ id: string; name: string; parentId: string | null }[]>([]);
  const [merchantWebsites, setMerchantWebsites] = useState<MerchantWebsite[]>([]);
  const [merchantOptionsOpen, setMerchantOptionsOpen] = useState(false);
  useEffect(() => {
    if (!deals) return;
    fetch("/api/v1/catalog", { cache: "no-store" }).then((r) => r.json()).then((b) => {
      setCategories(b?.data?.categories ?? b?.categories ?? []);
      setMerchantWebsites(b?.data?.merchantWebsites ?? b?.merchantWebsites ?? []);
    }).catch(() => {});
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
    clearPictures();
    setSubmitMsg(null);
    setForm({
      title: item.title, productUrl: item.productUrl, merchantName: item.merchantName ?? "", categoryHint: item.categoryHint ?? "", price: String(item.priceMinor / 100),
      mrp: item.mrpMinor ? String(item.mrpMinor / 100) : "", couponCode: item.couponCode ?? "", brand: item.brand ?? "", description: item.description, descriptionHtml: item.descriptionHtml ?? "",
    });
    loadEditor(item.descriptionHtml || textToHtml(item.description));
    window.scrollTo({ top: document.getElementById("submit-deal")?.offsetTop ?? 0, behavior: "smooth" });
  }

  function resetDealForm() {
    setForm(emptyForm); loadEditor(""); clearPictures(); setEditing(null); setFetched(null); setSubmitMsg(null);
    try { if (profile?.email) localStorage.removeItem(`metadeals:deal-draft:${profile.email.trim().toLowerCase()}`); } catch { /* storage may be disabled */ }
    if (fileInput.current) fileInput.current.value = "";
  }

  function addFile(file: File | undefined) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setSubmitMsg({ ok: false, text: "Use a JPEG, PNG, WebP, GIF or AVIF picture up to 5 MB." });
      return;
    }
    setSubmitMsg(null);
    // The limit is checked on the latest list (this also runs from the paste listener, which would otherwise see an old list).
    setPictures((list) => (list.length >= MAX_PICTURES ? list : [...list, { id: newId(), kind: "file", file, preview: URL.createObjectURL(file) }]));
  }
  /** + or tick on a picture found on the product page. */
  function toggleFound(url: string) {
    setPictures((list) => list.some((p) => p.kind === "url" && p.url === url) ? list.filter((p) => !(p.kind === "url" && p.url === url)) : list.length >= MAX_PICTURES ? list : [...list, { id: newId(), kind: "url", url }]);
  }
  function removePicture(id: string) {
    setPictures((list) => { const gone = list.find((p) => p.id === id); if (gone?.kind === "file") URL.revokeObjectURL(gone.preview); return list.filter((p) => p.id !== id); });
  }
  const makeFirst = (id: string) => setPictures((list) => { const hit = list.find((p) => p.id === id); return hit ? [hit, ...list.filter((p) => p.id !== id)] : list; });
  function clearPictures() {
    setPictures((list) => { for (const p of list) if (p.kind === "file") URL.revokeObjectURL(p.preview); return []; });
    if (fileInput.current) fileInput.current.value = "";
  }

  // Same extractor as the admin "Fetch" button: fills the form from the store page; everything stays editable.
  async function fetchFromLink(auto = false) {
    setSubmitMsg(null);
    const link = form.productUrl.trim().replace(/^http:\/\//i, "https://");
    if (!/^https:\/\//i.test(link)) return auto ? undefined : setSubmitMsg({ ok: false, text: "Paste the store's product link first (it must start with http:// or https://)." });
    setFetching(true);
    try {
      const body = await api<{ data: { logoUrl: string | null; status: string; store: string; productUrl: string; title: string; brand: string; description: string; priceRupees: string; mrpRupees: string; category: string; images: string[]; notes: string[] } }>(
        "/api/v1/customer/product-fetch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: link }) });
      const d = body.data;
      const matchedWebsite = websiteForUrl(d.productUrl || link, merchantWebsites)
        ?? merchantWebsites.find((item) => item.name.toLowerCase() === d.store.toLowerCase())
        ?? null;
      const detectedMerchant = matchedWebsite?.name || d.store;
      setForm((f) => ({ ...f, title: d.title || f.title, brand: d.brand || f.brand, description: d.description || f.description, price: d.priceRupees || f.price, mrp: d.mrpRupees || f.mrp, merchantName: detectedMerchant || f.merchantName, categoryHint: guessCategory(categories.map((c) => c.name), d.category, d.title, d.brand) || f.categoryHint, productUrl: d.productUrl || f.productUrl }));
      setFetched({ logoUrl: matchedWebsite?.logoUrl || d.logoUrl, store: detectedMerchant, images: d.images, notes: d.notes, category: d.category, status: d.status });
      // The first picture found is chosen for the member; they can add more or swap it.
      setPictures((list) => [...list.filter((p) => p.kind === "file"), ...(d.images[0] ? [{ id: newId(), kind: "url" as const, url: d.images[0] }] : [])]);
      if (d.description) { lastAutoDescription.current = htmlToPlain(textToHtml(d.description)); loadEditor(textToHtml(d.description)); }
      setAutoFilled([d.title && "title", d.priceRupees && "price", d.mrpRupees && "mrp", d.brand && "brand", d.description && "description", detectedMerchant && "merchantName"].filter((k): k is string => Boolean(k)));
      // The blue notice below the link box says details were filled in; only a page we could not read needs an error here.
      setSubmitMsg(d.title || d.priceRupees ? null : { ok: false, text: "We could not read this page automatically. Please fill in the details yourself." });
    } catch (error) {
      setSubmitMsg({ ok: false, text: error instanceof Error ? error.message : "Could not fetch the details. Please fill them in yourself." });
    } finally { setFetching(false); }
  }

  // Details fill in by themselves a moment after a new link is pasted (one fetch per link). "Try again" runs it by hand.
  useEffect(() => {
    if (!deals || editing) return;
    const link = form.productUrl.trim().replace(/^http:\/\//i, "https://");
    if (!/^https:\/\/[^\s/]+\.[^\s/]+\//i.test(link) || link === lastAutoUrl.current) return;
    const timer = setTimeout(() => { lastAutoUrl.current = link; void fetchFromLink(true); }, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchFromLink reads the latest form; only a new link should restart the timer
  }, [form.productUrl, deals, editing]);
  const dealCheck = useDealCheck(form.productUrl, form.title, Boolean(deals) && !editing);
  const progressValues = { productUrl: form.productUrl, title: form.title, price: form.price, mrp: form.mrp, description: form.description, categoryHint: form.categoryHint, merchantName: form.merchantName, brand: form.brand, hasImage: Boolean(image || pickedImage) };
  const auto = (k: string) => (autoFilled.includes(k) ? <em className={styles.auto}>auto-filled</em> : null);

  async function submitDeal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (form.mrp && Number(form.price) > Number(form.mrp)) {
      setSubmitMsg({ ok: false, text: "Deal price cannot be higher than the MRP." });
      return;
    }
    if (form.description.trim().length < 10) { setSubmitMsg({ ok: false, text: "Describe the deal in at least 10 characters." }); return; }
    setBusy(true);
    setSubmitMsg(null);
    try {
      if (!editing && !image && !pickedImage) { setSubmitMsg({ ok: false, text: "Please upload a product picture, or fetch details and choose one." }); setBusy(false); return; }
      const data = {
        title: form.title, productUrl: form.productUrl.trim().replace(/^http:\/\//i, "https://"), description: form.description, descriptionHtml: form.descriptionHtml || null, priceMinor: toMinor(form.price),
        brand: form.brand || null, merchantName: form.merchantName || null, categoryHint: form.categoryHint || null,
        mrpMinor: form.mrp ? toMinor(form.mrp) : null, couponCode: form.couponCode || null,
        ...(!image && pickedImage ? { imageUrl: pickedImage } : {}),
        // Pictures after the main one: found links travel in the details, files are attached below.
        ...(pictures.slice(1).some((p) => p.kind === "url") ? { extraImageUrls: pictures.slice(1).flatMap((p) => (p.kind === "url" ? [p.url] : [])) } : {}),
      };
      const body = new FormData();
      body.set("data", JSON.stringify(data));
      if (image) body.set("image", image);
      for (const p of pictures.slice(1)) if (p.kind === "file") body.append("images", p.file);
      if (editing) body.set("version", String(editing.version));
      await api(editing ? `/api/v1/customer/submissions/${editing.id}` : "/api/v1/customer/submissions", { method: editing ? "PATCH" : "POST", body });
      try { if (profile?.email) localStorage.removeItem(`metadeals:deal-draft:${profile.email.trim().toLowerCase()}`); } catch { /* submission already succeeded */ }
      setForm(emptyForm); loadEditor(""); clearPictures(); setEditing(null); setFetched(null);
      await refresh();
      setSubmitMsg({ ok: true, text: editing ? "Sent back for review." : "Thank you! Your deal was sent for review. It stays private until our team approves and publishes it." });
    } catch (error) {
      setSubmitMsg({ ok: false, text: error instanceof Error ? error.message : "Could not submit." });
    } finally { setBusy(false); }
  }

  const set = (key: keyof typeof emptyForm) => (e: { target: { value: string } }) => { setAutoFilled((a) => a.filter((k) => k !== key)); setForm((f) => ({ ...f, [key]: e.target.value })); };
  const selectedCat = categories.find((x) => x.name === form.categoryHint);
  const mainCat = selectedCat ? (selectedCat.parentId ? categories.find((x) => x.id === selectedCat.parentId) : selectedCat) : undefined;
  const subCats = mainCat ? categories.filter((x) => x.parentId === mainCat.id) : [];
  const c = profile?.counts;
  const merchantQuery = form.merchantName.trim().toLowerCase();
  const matchingMerchants = merchantWebsites.filter((merchant) =>
    !merchantQuery || merchant.name.toLowerCase().includes(merchantQuery) || merchant.domain.toLowerCase().includes(merchantQuery),
  ).slice(0, 10);
  const selectedMerchant = merchantWebsites.find((merchant) => merchant.name.toLowerCase() === merchantQuery) ?? null;
  const discount = form.mrp && form.price && Number(form.mrp) > 0
    ? Math.max(0, Math.round(((Number(form.mrp) - Number(form.price)) / Number(form.mrp)) * 100))
    : null;

  function saveLocalDraft() {
    if (!profile?.email) return setSubmitMsg({ ok: false, text: "Your account is still loading. Try again in a moment." });
    try {
      localStorage.setItem(`metadeals:deal-draft:${profile.email.trim().toLowerCase()}`, JSON.stringify({ form, pickedImage, savedAt: new Date().toISOString() }));
      setSubmitMsg({ ok: true, text: "Draft saved on this device. Uploaded files are not saved in a draft." });
    } catch { setSubmitMsg({ ok: false, text: "This browser could not save the draft. Please keep the page open or submit it for review." }); }
  }

  function restoreLocalDraft() {
    if (!profile?.email) return;
    try {
      const raw = localStorage.getItem(`metadeals:deal-draft:${profile.email.trim().toLowerCase()}`);
      if (!raw) return setSubmitMsg({ ok: false, text: "No saved draft was found on this device." });
      const draft = JSON.parse(raw) as { form?: typeof emptyForm; pickedImage?: string };
      if (!draft.form || typeof draft.form.title !== "string" || typeof draft.form.productUrl !== "string") throw new Error("Invalid draft");
      setForm({ ...emptyForm, ...draft.form });
      loadEditor(draft.form.descriptionHtml || textToHtml(draft.form.description ?? ""));
      setPictures(typeof draft.pickedImage === "string" && draft.pickedImage ? [{ id: newId(), kind: "url", url: draft.pickedImage }] : []);
      setEditing(null);
      setSubmitMsg({ ok: true, text: "Draft restored from this device. Please check the details and add any missing product image." });
    } catch { setSubmitMsg({ ok: false, text: "The saved draft could not be restored." }); }
  }

  return (
    <div className={`${styles.wrap} ${deals ? styles.dealPage : ""}`} style={embedded ? { maxWidth: "none", margin: 0, padding: 0, width: "100%" } : undefined}>
      {!embedded && deals && (
        <section className={styles.dealStrip} aria-label="Post a Deal and your deal counts">
          <span className={styles.stripIcon} aria-hidden="true"><Megaphone size={36} /></span>
          <div className={styles.stripText}><h1>Post a Deal</h1><p>Found a great offer?<br />Share it here &amp;<br />help others save</p></div>
          <dl className={styles.stripStats}>
            <div><span className={`${styles.stripStatIcon} ${styles.toneSent}`} aria-hidden="true"><Send size={22} /></span><dt>Submitted</dt><dd>{c?.total ?? "–"}</dd></div>
            <div><span className={`${styles.stripStatIcon} ${styles.toneLive}`} aria-hidden="true"><Check size={22} /></span><dt>Approved</dt><dd>{c ? c.live + c.approvedAwaitingPublication : "–"}</dd></div>
            <div><span className={`${styles.stripStatIcon} ${styles.toneNo}`} aria-hidden="true"><X size={22} /></span><dt>Rejected</dt><dd>{c?.rejected ?? "–"}</dd></div>
            <div><span className={`${styles.stripStatIcon} ${styles.toneWait}`} aria-hidden="true"><Hourglass size={22} /></span><dt>Awaiting Review</dt><dd>{c?.pendingReview ?? "–"}</dd></div>
            <div><span className={`${styles.stripStatIcon} ${styles.toneOnair}`} aria-hidden="true"><Radio size={22} /></span><dt>Live</dt><dd>{c?.live ?? "–"}</dd></div>
          </dl>
          <Link href="/" className={styles.stripCta}><Compass size={26} aria-hidden="true" /> <span>Explore <br />Deals</span></Link>
        </section>
      )}
      {!embedded && !deals && <div className={styles.head}>
        <div><h1>{deals ? "Post a Deal" : "Your profile"}</h1><p className={styles.sub}>{deals ? "Found a great offer? Share it with the community & help others save" : profile?.email}</p></div>
        <div className={styles.actions}>
          {deals ? <Link href="/account" className={styles.secondary}>My profile</Link> : <Link href="/post-deal" className={styles.secondary}>Post a Deal</Link>}
          <Link href="/" className={styles.secondary}>Explore deals</Link>
          <button className={styles.secondary} onClick={() => void signOut({ callbackUrl: "/" })}>Sign out</button>
        </div>
      </div>}

      {!embedded && <UserNamePrompt />}
      {!deals && <IdentityCard />}

      {!(deals && !embedded) && <section className={`${styles.tiles} ${deals ? styles.dealStats : ""}`} aria-label="Your deal submissions">
        <div className={styles.tile}>{deals && <span className={styles.statIcon} aria-hidden="true">➤</span>}<span><small>Submitted</small><strong>{c?.total ?? "–"}</strong></span></div>
        <div className={styles.tile}>{deals && <span className={styles.statIcon} aria-hidden="true">⌛</span>}<span><small>Awaiting {deals ? "Review" : "review"}</small><strong>{c?.pendingReview ?? "–"}</strong></span></div>
        <div className={styles.tile}>{deals && <span className={styles.statIcon} aria-hidden="true">✕</span>}<span><small>{deals ? "Not Approved" : "Not approved"}</small><strong>{c?.rejected ?? "–"}</strong></span></div>
        <div className={styles.tile}>{deals && <span className={styles.statIcon} aria-hidden="true">✓</span>}<span><small>Live</small><strong>{c?.live ?? "–"}</strong>{!!c?.approvedAwaitingPublication && <em>{c.approvedAwaitingPublication} approved, going live soon</em>}</span></div>
      </section>}

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

      {deals && <div className={styles.dealLayout}>
        <section className={`${styles.card} ${styles.dealFormCard}`} id="submit-deal">
          <form id="deal-form" className={styles.dealForm} onSubmit={submitDeal}>
            <ProgressPanel values={progressValues} compact />
            <div className={styles.dealStep}>
              <h2><span>1</span> Product Link</h2>
              <p>Paste the product page link and wait for few seconds, we’ll fetch the details for you.</p>
              <label className={styles.dealWide}>Product URL<input type="url" value={form.productUrl} onChange={set("productUrl")} required placeholder="https://www.store.com/product..." /></label>
              <div className={styles.dealActions}>
                <button type="button" className={styles.primary} disabled={busy || fetching || !form.productUrl} onClick={() => void fetchFromLink()}>{fetching ? "Fetching details…" : fetched ? "↻ Try again" : "↻ Fetch details"}</button>
                <span className={styles.hint}>or</span>
                <button type="button" className={styles.secondary} disabled={busy || fetching} onClick={() => titleInput.current?.focus()}>✎ Add details manually</button>
                <button type="button" className={styles.secondary} disabled={busy || fetching} onClick={resetDealForm}>Reset</button>
                {profile?.email && <button type="button" className={styles.secondary} onClick={restoreLocalDraft}>Restore draft</button>}
              </div>
              {submitMsg && <div className={submitMsg.ok ? styles.ok : styles.err} role="status">{submitMsg.text}</div>}
              {fetching && <div className={styles.autoNotice} role="status">Fetching details from the link…</div>}
              {fetched && !fetching && <div className={styles.autoNotice} role="status">We&apos;ve filled in as much information as possible from {fetched.store || "the product page"}. Please double check for accuracy. {fetched.notes.join(" ")}</div>}
              <SameLinkNotice check={dealCheck} />
            </div>
            {editing?.rejectionReason && <p className={styles.reason}>Why it was not approved: {editing.rejectionReason}</p>}
            <div className={styles.dealStep}>
              <h2><span>2</span> Deal Details</h2>
              <label className={styles.dealWide}>Deal title <b aria-hidden="true">*</b>{auto("title")}<input ref={titleInput} value={form.title} onChange={set("title")} required minLength={3} maxLength={200} placeholder="e.g. Wireless headphones — 60% off" /></label>
              <SimilarDeals check={dealCheck} />
              <div className={styles.dealGrid3}>
                <label>Deal price (₹) <b aria-hidden="true">*</b>{auto("price")}<input inputMode="decimal" value={form.price} onChange={set("price")} required pattern="[0-9]+(\.[0-9]{1,2})?" placeholder="e.g. 1,499" /></label>
                <label>MRP (₹, optional){auto("mrp")}<input inputMode="decimal" value={form.mrp} onChange={set("mrp")} pattern="[0-9]+(\.[0-9]{1,2})?" placeholder="e.g. 4,999" /></label>
                <label>Discount<div className={styles.discountField}>{discount === null ? "—" : `${discount}% off`}</div></label>
                <label className={styles.merchantLabel}>Store / Merchant
                  <span className={styles.merchantControl}>
                    {selectedMerchant?.logoUrl && <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={selectedMerchant.logoUrl} alt={`${selectedMerchant.name} logo`} referrerPolicy="no-referrer" />
                    </>}
                    <input
                      role="combobox"
                      aria-autocomplete="list"
                      aria-expanded={merchantOptionsOpen && matchingMerchants.length > 0}
                      aria-controls="merchant-website-options"
                      autoComplete="off"
                      value={form.merchantName}
                      onFocus={() => setMerchantOptionsOpen(true)}
                      onBlur={() => window.setTimeout(() => setMerchantOptionsOpen(false), 120)}
                      onChange={(event) => { set("merchantName")(event); setMerchantOptionsOpen(true); }}
                      maxLength={100}
                      placeholder="Search merchant or website"
                    />
                    {merchantOptionsOpen && matchingMerchants.length > 0 && <span className={styles.merchantOptions} id="merchant-website-options" role="listbox">
                      {matchingMerchants.map((merchant) => <button
                        type="button"
                        key={merchant.id}
                        role="option"
                        aria-selected={selectedMerchant?.id === merchant.id}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => { setForm((current) => ({ ...current, merchantName: merchant.name })); setMerchantOptionsOpen(false); }}
                      >
                        {merchant.logoUrl ? <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={merchant.logoUrl} alt="" referrerPolicy="no-referrer" />
                        </> : <span className={styles.merchantLogoFallback}>{merchant.name.slice(0, 1).toUpperCase()}</span>}
                        <span><b>{merchant.name}</b><small>{merchant.domain}</small></span>
                      </button>)}
                    </span>}
                  </span>
                  {selectedMerchant && <small className={styles.merchantMapped}>✓ Matched to {selectedMerchant.domain}; merchant logo will be available to reviewers.</small>}
                </label>
                <label>Brand (optional){auto("brand")}<input value={form.brand} onChange={set("brand")} maxLength={100} placeholder="e.g. boAt" /></label>
                <label>Coupon code (optional)<input value={form.couponCode} onChange={set("couponCode")} maxLength={50} placeholder="e.g. BOAT20" /></label>
              </div>
              <div className={styles.dealGrid2}>
                <label>Main category <b aria-hidden="true">*</b><select value={mainCat?.name ?? ""} onChange={(e) => setForm((f) => ({ ...f, categoryHint: e.target.value }))} required><option value="">Choose a category</option>{categories.filter((category) => !category.parentId).map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}</select></label>
                {subCats.length > 0 ? <label>Sub-category (optional)<select value={selectedCat?.parentId ? selectedCat.name : ""} onChange={(e) => setForm((f) => ({ ...f, categoryHint: e.target.value || mainCat?.name || "" }))}><option value="">Select sub-category</option>{subCats.map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}</select></label> : <div />}
              </div>
            </div>
            <div className={styles.dealStep}>
              <h2><span>3</span> Description</h2>
              <div className={styles.dealWide}>
                <span id="deal-description-label" style={{ fontWeight: 700, fontSize: 14 }}>Deal details <b aria-hidden="true">*</b>{auto("description")}</span>
                <RichEditor tables id="deal-description" initialHtml={editorHtml} version={editorVersion} limit={2000} minHeight={150} placeholder="Add key details, offer terms, validity, or why it’s a good buy..."
                  onChange={(html) => {
                    const plain = html ? htmlToPlain(html) : "";
                    setForm((f) => (f.descriptionHtml === html && f.description === plain ? f : { ...f, descriptionHtml: html, description: plain }));
                    if (plain !== lastAutoDescription.current) setAutoFilled((list) => list.filter((k) => k !== "description"));
                  }} />
              </div>
            </div>
            <div className={styles.dealStep}>
              <h2><span>4</span> Product Images</h2>
              <div className={styles.uploadRow}>
                <button type="button" className={styles.uploadBox} onClick={() => fileInput.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); for (const f of Array.from(e.dataTransfer.files).slice(0, MAX_PICTURES)) addFile(f); }}><span aria-hidden="true">▧</span><strong>Add pictures</strong><small>JPEG, PNG, WebP, GIF or AVIF · up to 5 MB each · up to {MAX_PICTURES}</small><small>Drag files here or paste with Ctrl+V</small></button>
              </div>
              <input ref={fileInput} type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,image/avif" hidden onChange={(e) => { for (const f of Array.from(e.target.files ?? [])) addFile(f); e.target.value = ""; }} />
              {pictures.length > 0 && <div className={styles.addedImages} aria-label="Added pictures">
                <p className={styles.hint}>{pictures.length} of {MAX_PICTURES} added. The first picture is the main one.</p>
                <ul>{pictures.map((p, i) => (
                  <li key={p.id}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.kind === "file" ? p.preview : proxied(p.url)} alt={`Picture ${i + 1}`} />
                    {i === 0 ? <b>Main</b> : <button type="button" onClick={() => makeFirst(p.id)}>Make main</button>}
                    <button type="button" className={styles.removePic} onClick={() => removePicture(p.id)} aria-label={`Remove picture ${i + 1}`}>×</button>
                  </li>
                ))}</ul>
              </div>}
              {fetched?.images?.length ? <div aria-label="Pictures found on the product page">
                <p className={styles.hint}>We found these pictures on the product page. Tap + to add one.</p>
                <div className={styles.imageChoices}>{[...new Set(fetched.images)].slice(0, 10).map((src) => {
                  const on = pictures.some((p) => p.kind === "url" && p.url === src);
                  return <button type="button" key={src} aria-pressed={on} onClick={() => toggleFound(src)} title={on ? "Remove this picture" : "Add this picture"}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={proxied(src)} alt="Found on the product page" onError={(e) => { if (e.currentTarget.dataset.fb !== "1") { e.currentTarget.dataset.fb = "1"; e.currentTarget.src = src; e.currentTarget.referrerPolicy = "no-referrer"; } }} />
                    <span className={styles.plus} aria-hidden="true">{on ? "✓" : "+"}</span>
                  </button>;
                })}</div>
              </div> : <p className={styles.hint}>Paste the product link above and we will look for its pictures, or add your own.</p>}
            </div>
            <div className={styles.dealSubmit}>
              <button type="button" className={styles.secondary} onClick={saveLocalDraft}>▣ Save as Draft</button>
              <button type="button" className={styles.secondary} onClick={() => setPreviewOpen(true)}>👁 Preview Deal</button>
              <div className={styles.dealActions}>
                {editing && <button type="button" className={styles.secondary} onClick={() => { setEditing(null); setForm(emptyForm); }}>Cancel</button>}
                <button className={styles.primary} disabled={busy}>{busy ? "Sending…" : editing ? "Submit changes for review" : "➤ Submit for Review"}</button>
              </div>
            </div>
          </form>
        </section>
        <aside className={styles.dealSidebar}>
          <ProgressPanel values={progressValues} />
          <section className={styles.sideCard}><h2>💡 Tips for a great deal</h2><ul><li>Use the product page link from the retailer.</li><li>Add a clear, concise title.</li><li>Include the deal price and MRP when available.</li><li>Mention coupon codes and offer terms.</li><li>Upload a clear product image.</li><li>Share a genuine, current offer.</li></ul></section>
          <section className={styles.sideCard}><h2>♧ How it works</h2><ol><li><b>Post your deal</b><small>Share the link and available details.</small></li><li><b>Our team reviews it</b><small>We verify the information before publication.</small></li><li><b>Get it published</b><small>Approved deals are published by our team.</small></li></ol></section>
          <p className={styles.privateNote}>Your submission stays private until approved. Your email is never shown publicly.</p>
        </aside>
      </div>}
      {previewOpen && <PreviewDialog title={form.title} price={form.price} mrp={form.mrp} store={form.merchantName} brand={form.brand} coupon={form.couponCode} description={form.description} imageSrc={image ? uploadedPreview : pickedImage} busy={busy}
        onClose={() => { setPreviewOpen(false); titleInput.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }}
        onPublish={() => { setPreviewOpen(false); (document.getElementById("deal-form") as HTMLFormElement | null)?.requestSubmit(); }} />}

      {deals && <section className={styles.card} id="my-submissions">
        <h2>My submissions</h2>
        <div className={styles.actions} role="group" aria-label="Filter my deals" style={{ marginBottom: 12, flexWrap: "wrap" }}>
          {([["all", "All"], ["PENDING_REVIEW", "Awaiting review"], ["APPROVED", "Approved"], ["LIVE", "Live"], ["REJECTED", "Rejected"], ["EXPIRED", "Expired"], ["ARCHIVED", "Archived"]] as const).map(([key, label]) => (
            <button key={key} type="button" className={styles.secondary} aria-pressed={filter === key} style={filter === key ? { fontWeight: 700 } : undefined} onClick={() => setFilter(key)}>{label}</button>
          ))}
        </div>
        <div className={styles.list}>
          {submissions.filter((s) => filter === "all" || (filter === "EXPIRED" || filter === "ARCHIVED" ? s.dealState === filter : filter === "LIVE" ? s.dealState === "LIVE" : filter === "APPROVED" ? s.stage === "APPROVED" || s.stage === "LIVE" : s.stage === filter)).map((s) => (
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
