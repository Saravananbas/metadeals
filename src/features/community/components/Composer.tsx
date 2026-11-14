"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bookmark, CheckCircle2, ChevronLeft, ChevronRight, FileText, HelpCircle, Image as ImageIcon, Lightbulb, Eye, Info, MessageSquare, Monitor, Paperclip, Send, Share2, Smartphone, Tag, ArrowBigUp, ArrowBigDown, X, Check } from "lucide-react";
import { LIMITS } from "../validation";
import { RichEditor } from "./RichEditor";
import styles from "../composer.module.css";

type Community = { slug: string; name: string };
type Node = { id: string; parentId: string | null; slug: string; name: string };
type PostType = "DISCUSSION" | "QUESTION" | "DEAL";
type Img = { key: string; id?: string; url: string; progress: number; error?: string };
type SaveState = "idle" | "saving" | "saved" | "error";
type Viewer = { handle: string; avatarUrl: string | null } | null;

const TYPES = [
  { value: "DISCUSSION", label: "Discussion", text: "Share your thoughts, experiences or ideas with the community.", Icon: MessageSquare },
  { value: "QUESTION", label: "Question", text: "Get help, advice or recommendations.", Icon: HelpCircle },
  { value: "DEAL", label: "Deal", text: "Share a great offer, discount or shopping deal.", Icon: Tag },
] as const;
const MAX_BYTES = 5 * 1024 * 1024;

const minor = (value: string) => Math.round(Number(value) * 100);
const rupees = (value: string) => (value && !Number.isNaN(Number(value)) ? `₹${Number(value).toLocaleString("en-IN")}` : "");

export function Composer({ communities, tree, general, defaultCommunity, viewer, guidelinesHref = "/community" }: { communities: Community[]; tree: Node[]; general: Community[]; defaultCommunity?: string; viewer: Viewer; guidelinesHref?: string }) {
  const router = useRouter();
  const mains = useMemo(() => tree.filter((n) => !n.parentId), [tree]);
  const firstSlug = defaultCommunity && communities.some((c) => c.slug === defaultCommunity) ? defaultCommunity : general[0]?.slug ?? mains[0]?.slug ?? communities[0]?.slug ?? "";
  const [type, setType] = useState<PostType>("DISCUSSION");
  const [communitySlug, setCommunitySlug] = useState(firstSlug);
  const [title, setTitle] = useState("");
  const [html, setHtml] = useState(""), [textLen, setTextLen] = useState(0), [editorVersion, setEditorVersion] = useState(0), [initialHtml, setInitialHtml] = useState("");
  const [images, setImages] = useState<Img[]>([]);
  const [f, setF] = useState({ url: "", merchantName: "", price: "", mrp: "", couponCode: "" });
  const [notify, setNotify] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false), submitted = useRef(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop"), [previewOpen, setPreviewOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false), dragIndex = useRef<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null), previewRef = useRef<HTMLDivElement>(null);
  const restored = useRef(false), lastSaved = useRef("");

  // Category and subcategory (both read from the shop categories already in the database)
  const isGeneral = general.some((g) => g.slug === communitySlug);
  const current = tree.find((n) => n.slug === communitySlug);
  const mainNode = current ? (current.parentId ? tree.find((n) => n.id === current.parentId) : current) : undefined;
  const subs = mainNode && !isGeneral ? tree.filter((n) => n.parentId === mainNode.id) : [];
  const categoryName = isGeneral ? general.find((g) => g.slug === communitySlug)?.name ?? "" : mainNode?.name ?? "";
  const subName = !isGeneral && current && current.parentId ? current.name : mainNode ? `General (${mainNode.name})` : "";
  const label = (key: string) => errors[key] && <span className={styles.fieldError} role="alert">{errors[key]}</span>;

  const payload = useMemo(() => ({ type, communitySlug, title, bodyHtml: html, url: f.url, merchantName: f.merchantName, price: f.price, mrp: f.mrp, couponCode: f.couponCode, notifyReplies: notify, imageIds: images.flatMap((i) => (i.id ? [i.id] : [])) }), [type, communitySlug, title, html, f, notify, images]);

  // Restore the member's own draft once.
  useEffect(() => {
    if (!viewer || restored.current) return;
    restored.current = true;
    fetch("/api/v1/community/draft", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((body) => {
      const d = body?.data; if (!d) return;
      const x = d.draft;
      setType(x.type); if (x.communitySlug) setCommunitySlug(x.communitySlug); setTitle(x.title);
      setF({ url: x.url, merchantName: x.merchantName, price: x.price, mrp: x.mrp, couponCode: x.couponCode }); setNotify(x.notifyReplies);
      setInitialHtml(x.bodyHtml); setHtml(x.bodyHtml); setEditorVersion((v) => v + 1);
      setImages((d.images as { id: string; url: string }[]).map((i) => ({ key: i.id, id: i.id, url: i.url, progress: 100 })));
      setSaveState("saved"); lastSaved.current = JSON.stringify({ ...x, imageIds: x.imageIds });
      setBanner({ ok: true, text: "We restored your unfinished draft." });
    }).catch((error) => console.error("draft restore failed", error));
  }, [viewer]);

  // Draft autosave: only when something changed, at most once every two seconds.
  const hasContent = Boolean(title.trim() || textLen || images.length || f.url || f.price);
  useEffect(() => {
    if (!viewer || !hasContent || submitted.current) return;
    const body = { type: payload.type, communitySlug: payload.communitySlug, title: payload.title, bodyHtml: payload.bodyHtml, url: payload.url, merchantName: payload.merchantName, price: payload.price, mrp: payload.mrp, couponCode: payload.couponCode, notifyReplies: payload.notifyReplies, imageIds: payload.imageIds };
    const snapshot = JSON.stringify(body);
    if (snapshot === lastSaved.current) return;
    const timer = setTimeout(() => void saveDraft(snapshot, false), 2000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload, viewer, hasContent]);

  async function saveDraft(snapshot: string, announce: boolean) {
    setSaveState("saving");
    try {
      const response = await fetch("/api/v1/community/draft", { method: "PUT", headers: { "Content-Type": "application/json" }, body: snapshot });
      if (!response.ok) throw new Error(response.status === 401 ? "Sign in to save a draft." : "Could not save the draft.");
      lastSaved.current = snapshot; setSaveState("saved");
      if (announce) setBanner({ ok: true, text: "Draft saved. You can finish it later." });
    } catch (error) { setSaveState("error"); if (announce) setBanner({ ok: false, text: error instanceof Error ? error.message : "Could not save the draft." }); }
  }
  const saveNow = () => { if (!viewer) return setBanner({ ok: false, text: "Please sign in to save a draft." }); void saveDraft(JSON.stringify({ type, communitySlug, title, bodyHtml: html, url: f.url, merchantName: f.merchantName, price: f.price, mrp: f.mrp, couponCode: f.couponCode, notifyReplies: notify, imageIds: payload.imageIds }), true); };

  // Pictures: validated here for a quick answer and again on the server (which decodes and re-encodes every file).
  const upload = useCallback((file: File) => {
    const key = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const preview = URL.createObjectURL(file);
    const update = (patch: Partial<Img>) => setImages((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));
    setImages((list) => [...list, { key, url: preview, progress: 0 }]);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/v1/community/images");
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) update({ progress: Math.round((e.loaded / e.total) * 100) }); };
    xhr.onload = () => {
      let body: { data?: { id: string; url: string }; error?: string } = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* keep the generic message */ }
      if (xhr.status >= 200 && xhr.status < 300 && body.data) { URL.revokeObjectURL(preview); update({ id: body.data.id, url: body.data.url, progress: 100 }); }
      else update({ error: xhr.status === 401 ? "Sign in to add pictures." : body.error ?? "Upload failed.", progress: 0 });
    };
    xhr.onerror = () => update({ error: "Network problem. Try again.", progress: 0 });
    const form = new FormData(); form.append("image", file); xhr.send(form);
  }, []);
  function addFiles(list: FileList | File[]) {
    let slots = LIMITS.maxImages - images.filter((i) => !i.error).length;
    for (const file of Array.from(list)) {
      if (slots <= 0) { setBanner({ ok: false, text: `You can attach up to ${LIMITS.maxImages} pictures.` }); break; }
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { setBanner({ ok: false, text: `${file.name}: use a JPEG, PNG or WebP picture.` }); continue; }
      if (file.size > MAX_BYTES) { setBanner({ ok: false, text: `${file.name} is larger than 5 MB.` }); continue; }
      slots--; upload(file);
    }
  }
  async function removeImage(img: Img) {
    setImages((list) => list.filter((i) => i.key !== img.key));
    if (img.id) await fetch(`/api/v1/community/images/${img.id}`, { method: "DELETE" }).catch(() => {});
  }
  const move = (from: number, to: number) => setImages((list) => { if (to < 0 || to >= list.length) return list; const next = [...list]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next; });

  function validate() {
    const e: Record<string, string> = {};
    if (!communitySlug) e.category = "Choose a category.";
    const t = title.trim();
    if (t.length < 5) e.title = "The title needs at least 5 characters."; else if (t.length > LIMITS.newPostTitle) e.title = `The title can be at most ${LIMITS.newPostTitle} characters.`;
    if (type !== "DEAL" && textLen < 10) e.body = "Add a few words so others can respond (at least 10 characters).";
    if (textLen > LIMITS.richBody) e.body = `Your post is too long (${textLen} of ${LIMITS.richBody} characters).`;
    if (type === "DEAL") {
      if (!f.url.trim()) e.url = "A deal needs a link to the store's product page.";
      if (!f.price.trim() || Number.isNaN(Number(f.price)) || Number(f.price) < 1) e.price = "Enter the price you saw (₹).";
      if (f.mrp && Number(f.mrp) < Number(f.price)) e.mrp = "The MRP cannot be lower than the price.";
    }
    if (images.some((i) => i.progress < 100 && !i.error)) e.images = "Wait for the pictures to finish uploading.";
    setErrors(e); return Object.keys(e).length === 0;
  }

  async function post() {
    if (busy || submitted.current) return;
    setBanner(null);
    if (!validate()) { setBanner({ ok: false, text: "Please fix the highlighted fields." }); return; }
    setBusy(true);
    try {
      const body: Record<string, unknown> = { type, communitySlug, title: title.trim(), bodyHtml: html || undefined, imageIds: payload.imageIds, notifyReplies: notify };
      if (type === "DEAL") Object.assign(body, { url: f.url.trim(), merchantName: f.merchantName.trim() || null, priceMinor: minor(f.price), mrpMinor: f.mrp ? minor(f.mrp) : null, couponCode: f.couponCode.trim() || null });
      else if (type === "QUESTION" && f.url.trim()) body.url = f.url.trim();
      const response = await fetch("/api/v1/community/posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { setBanner({ ok: false, text: response.status === 401 ? "Please sign in to post." : result?.error ?? "Could not post." }); return; }
      submitted.current = true;
      setBanner({ ok: true, text: result.data.viewer?.status === "PENDING_REVIEW" ? "Thanks! A moderator will check your post before it appears." : "Posted! Taking you to your discussion…" });
      router.push(`/community/post/${result.data.slug}`);
    } catch { setBanner({ ok: false, text: "Network problem. Please try again." }); }
    finally { setBusy(false); }
  }

  const showPreview = () => { setPreviewOpen(true); setTimeout(() => previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); };
  const typeMeta = TYPES.find((t) => t.value === type)!;

  return (
    <div className={styles.grid}>
      <div className={styles.main}>
        <fieldset className={styles.types} role="radiogroup" aria-label="What do you want to share?">
          {TYPES.map(({ value, label: name, text, Icon }) => (
            <label key={value} className={`${styles.type} ${type === value ? styles.typeOn : ""}`}>
              <input type="radio" name="type" value={value} checked={type === value} onChange={() => setType(value)} />
              <span className={styles.typeIcon}><Icon size={24} /></span>
              <span><b>{name}</b><small>{text}</small></span>
              <span className={styles.check} aria-hidden><Check size={15} /></span>
            </label>
          ))}
        </fieldset>

        <div className={styles.card}>
          <div className={styles.two}>
            <div className={styles.field}>
              <label htmlFor="cat">Category<span className={styles.req}>*</span></label>
              <select id="cat" className={styles.select} value={isGeneral ? communitySlug : mainNode?.slug ?? ""} onChange={(e) => setCommunitySlug(e.target.value)} aria-invalid={Boolean(errors.category)}>
                {!isGeneral && !mainNode && <option value="">Choose a category</option>}
                {general.length > 0 && <optgroup label="General">{general.map((g) => <option key={g.slug} value={g.slug}>{g.name}</option>)}</optgroup>}
                <optgroup label="Shop categories">{mains.map((n) => <option key={n.slug} value={n.slug}>{n.name}</option>)}</optgroup>
              </select>
              {label("category")}
            </div>
            <div className={styles.field}>
              <label htmlFor="sub">Subcategory</label>
              <select id="sub" className={styles.select} value={communitySlug} onChange={(e) => setCommunitySlug(e.target.value)} disabled={!subs.length}>
                {mainNode && !isGeneral ? <option value={mainNode.slug}>General ({mainNode.name})</option> : <option value={communitySlug}>—</option>}
                {subs.map((n) => <option key={n.slug} value={n.slug}>{n.name}</option>)}
              </select>
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="title">{type === "DEAL" ? "Deal title (product name)" : "Title"}<span className={styles.req}>*</span></label>
            <div className={styles.inputWrap}>
              <input id="title" className={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={LIMITS.newPostTitle} placeholder={type === "QUESTION" ? "What would you like to ask?" : type === "DEAL" ? "e.g. boAt Airdopes 141 at ₹999" : "A clear, specific title"} aria-invalid={Boolean(errors.title)} />
              <span className={styles.inputCount}>{title.length} / {LIMITS.newPostTitle}</span>
            </div>
            {label("title")}
          </div>

          {type === "DEAL" && (
            <>
              <p className={styles.dealNote}>Deals shared here are community-shared and are not official MetaDeals4U deals. To suggest an official deal use <Link href="/post-deal">Post a Deal</Link>.</p>
              <div className={styles.field}>
                <label htmlFor="durl">Product link (https)<span className={styles.req}>*</span></label>
                <input id="durl" className={styles.input} type="url" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://www.store.com/product" aria-invalid={Boolean(errors.url)} />
                {label("url")}
              </div>
              <div className={styles.three}>
                <div className={styles.field}><label htmlFor="price">Price you saw (₹)<span className={styles.req}>*</span></label><input id="price" className={styles.input} inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />{label("price")}</div>
                <div className={styles.field}><label htmlFor="mrp">MRP (₹)</label><input id="mrp" className={styles.input} inputMode="decimal" value={f.mrp} onChange={(e) => setF({ ...f, mrp: e.target.value })} />{label("mrp")}</div>
                <div className={styles.field}><label htmlFor="store">Store</label><input id="store" className={styles.input} value={f.merchantName} maxLength={100} onChange={(e) => setF({ ...f, merchantName: e.target.value })} /></div>
                <div className={styles.field}><label htmlFor="coupon">Coupon code</label><input id="coupon" className={styles.input} value={f.couponCode} maxLength={50} onChange={(e) => setF({ ...f, couponCode: e.target.value })} /></div>
              </div>
            </>
          )}
          {type === "QUESTION" && (
            <div className={styles.field}>
              <label htmlFor="qurl">Product link (optional)</label>
              <input id="qurl" className={styles.input} type="url" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://www.store.com/product" />
            </div>
          )}

          <div className={styles.field}>
            <label htmlFor="body">{type === "DEAL" ? "Details" : "Your post"}{type !== "DEAL" && <span className={styles.req}>*</span>}</label>
            <RichEditor id="body" initialHtml={initialHtml} version={editorVersion} limit={LIMITS.richBody} placeholder={type === "QUESTION" ? "Describe your question and what you have already tried…" : type === "DEAL" ? "Anything useful about the deal (optional)" : "Write your post…"} onChange={(h, n) => { setHtml(h); setTextLen(n); }} onPickImage={() => fileInput.current?.click()} />
            {label("body")}
          </div>

          <div className={styles.field}>
            <div className={styles.attachHead}>
              <Paperclip size={22} />
              <div><span className={styles.label}>Add attachments <span className={styles.hint}>(optional)</span></span><div className={styles.hint}>Add images to make your post more useful (JPG, PNG, WebP – up to 5 MB each, max {LIMITS.maxImages} images)</div></div>
            </div>
            <div className={`${styles.tray} ${dragOver ? styles.dropOn : ""}`} onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}>
              {images.map((img, i) => (
                <div key={img.key} className={styles.thumb} draggable onDragStart={() => { dragIndex.current = i; }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.stopPropagation(); if (dragIndex.current !== null) move(dragIndex.current, i); dragIndex.current = null; }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt={`Attached picture ${i + 1}`} />
                  <button type="button" className={styles.thumbX} aria-label="Remove picture" onClick={() => void removeImage(img)}><X size={16} /></button>
                  {!img.error && img.progress < 100 && <div className={styles.progress} role="progressbar" aria-valuenow={img.progress}><i style={{ width: `${img.progress}%` }} /></div>}
                  {!img.error && <div className={styles.thumbBtns}><button type="button" className={styles.thumbBtn} aria-label="Move earlier" disabled={i === 0} onClick={() => move(i, i - 1)}><ChevronLeft size={16} /></button><button type="button" className={styles.thumbBtn} aria-label="Move later" disabled={i === images.length - 1} onClick={() => move(i, i + 1)}><ChevronRight size={16} /></button></div>}
                  {img.error && <div className={styles.thumbErr} role="alert">{img.error}</div>}
                </div>
              ))}
              {images.length < LIMITS.maxImages && (
                <button type="button" className={styles.add} onClick={() => fileInput.current?.click()}><span><ImageIcon size={26} /><br />Add Image</span></button>
              )}
              <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
            </div>
            {label("images")}
          </div>

          {banner && <div className={`${styles.banner} ${banner.ok ? styles.bannerOk : styles.bannerErr}`} role={banner.ok ? "status" : "alert"}>{banner.text}</div>}

          <div className={styles.bar}>
            <label className={styles.notify} title="We will tell you when someone replies once notifications are switched on. Your choice is saved with the post.">
              <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Also notify me about replies to this discussion <Info size={16} aria-label="Notifications are not switched on yet; your choice is saved for when they are." />
            </label>
            <div className={styles.actions}>
              <span className={styles.saveState} aria-live="polite">{saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved ✓" : saveState === "error" ? "Not saved" : ""}</span>
              <button type="button" className={styles.ghost} onClick={saveNow}><FileText size={18} /> Save Draft</button>
              <button type="button" className={`${styles.ghost} ${styles.mobileOnly}`} onClick={showPreview}><Eye size={18} /> Preview</button>
              <button type="button" className={styles.primary} onClick={post} disabled={busy}><Send size={18} /> {busy ? "Posting…" : "Post Discussion"}</button>
            </div>
          </div>
        </div>
      </div>

      <aside className={styles.side}>
        <div ref={previewRef} className={`${styles.previewCard} ${!previewOpen ? styles.previewHidden : ""}`}>
          <div className={styles.previewHead}>
            <h2><Eye size={20} /> Live Preview</h2>
            <div className={styles.toggle} role="group" aria-label="Preview size">
              <button type="button" className={device === "desktop" ? styles.toggleOn : ""} aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")}><Monitor size={16} /> Desktop</button>
              <button type="button" className={device === "mobile" ? styles.toggleOn : ""} aria-pressed={device === "mobile"} onClick={() => setDevice("mobile")}><Smartphone size={16} /> Mobile</button>
            </div>
          </div>
          <div className={`${styles.frame} ${device === "mobile" ? styles.frameMobile : ""}`}>
            <div className={styles.pvTop}>
              <span className={styles.pvAvatar}>{viewer?.avatarUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={viewer.avatarUrl} alt="" /> : (viewer?.handle ?? "?").slice(0, 1).toUpperCase()}</span>
              <span><b>{viewer?.handle ?? "Your user name"}</b><small>{categoryName || "Category"}{subName ? ` › ${subName}` : ""} · Just now · {typeMeta.label}</small></span>
            </div>
            <h3 className={styles.pvTitle}>{title || "Your title appears here"}</h3>
            {type === "DEAL" && (f.price || f.merchantName) && <div className={styles.pvDeal}><strong>{rupees(f.price)} {f.mrp ? <s>{rupees(f.mrp)}</s> : null} {f.merchantName ? `at ${f.merchantName}` : ""}</strong>{f.couponCode && <span>Coupon: {f.couponCode}</span>}</div>}
            {/* The editor only produces its own formatting nodes (no scripts, no raw HTML typed by the user), and the server sanitizes again on save. */}
            {html ? <div className={styles.pvBody} dangerouslySetInnerHTML={{ __html: html }} /> : <p className={styles.pvEmpty}>Your post will look like this as you write it.</p>}
            {images.length > 0 && <div className={styles.pvImages}>{images.map((img) => /* eslint-disable-next-line @next/next/no-img-element */ <img key={img.key} src={img.url} alt="" />)}</div>}
            <div className={styles.pvActions}><span><ArrowBigUp size={20} /> 0 <ArrowBigDown size={20} /></span><span><MessageSquare size={18} /> Comments</span><span><Bookmark size={18} /> Save</span><span><Share2 size={18} /> Share</span></div>
          </div>
        </div>
        <div className={styles.tips}>
          <h2><Lightbulb size={22} style={{ color: "var(--md-c-d97706)" }} /> Tips for a great discussion</h2>
          <ul>
            {["Use a clear and specific title", "Add relevant details and your context", "Include images when helpful", "Be polite and respectful"].map((t) => <li key={t}><CheckCircle2 size={20} />{t}</li>)}
            <li><CheckCircle2 size={20} />Follow the <Link href={guidelinesHref}>community guidelines</Link></li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
