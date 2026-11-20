"use client";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { Activity, Bell, BookmarkCheck, Calendar, Camera, Eye, Heart, Lock, Mail, MapPin, PenLine, ShieldCheck, Tag, Trophy, User, UserRound, Zap, CircleCheck, LayoutGrid, Users } from "lucide-react";
import { CustomerProfile } from "@/features/customer/CustomerProfile";
import { MyActivity } from "@/features/community/components/MyActivity";
import { BadgeBoard } from "@/features/badges/BadgeBoard";
import type { BadgeBoard as Board } from "@/features/badges/catalog";
import { EditProfile } from "@/features/profile/EditProfile";
import { VerifiedBadge } from "@/features/profile/VerifiedBadge";
import { notificationText, type NotificationType } from "@/features/community/notification-text";
import { useSavedDeals } from "@/features/home/saved-store";
import { SEX_LABELS, SEX_VALUES } from "@/features/customer/profile-validation";
import styles from "./dashboard.module.css";

export type Tab = "profile" | "deals" | "activity" | "saved" | "notifications";
type Dashboard = {
  account: { name: string; email: string; emailVerified: boolean; hasPassword: boolean; sex: string | null; dateOfBirth: string | null; location: string | null; memberSince: string; daysSinceJoining: number };
  forum: { handle: string; displayName: string | null; bio: string | null; location: string | null; hasAvatar: boolean; verified: boolean } | null;
  stats: { submitted: number; approved: number; live: number; views: number; helpfulVotes: number; badges: number };
  badgeBoard: Board;
  preferences: { dealAlerts: boolean; emailUpdates: boolean; frequency: "IMMEDIATE" | "DAILY" | "WEEKLY" | "OFF"; categorySlugs: string[] };
  unreadNotifications: number;
  highlights: { daysSinceJoining: number; discussions: number; comments: number; dealsContributed: number };
};
type Say = { ok: boolean; text: string } | null;

async function call<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(url, { method, cache: "no-store", headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error || "Please try again.");
  return (result?.data ?? result) as T;
}
const msg = (e: unknown) => (e instanceof Error ? e.message : "Please try again.");
const FREQ_LABEL = { IMMEDIATE: "Immediate", DAILY: "Daily summary", WEEKLY: "Weekly summary", OFF: "Disabled" } as const;
const number = (n: number) => n.toLocaleString("en-IN");
const Notice = ({ say }: { say: Say }) => (say ? <p className={say.ok ? styles.ok : styles.err} role={say.ok ? "status" : "alert"}>{say.text}</p> : null);

const TABS: { key: Tab; label: string; icon: typeof User }[] = [
  { key: "profile", label: "Profile", icon: User }, { key: "deals", label: "Post Deal", icon: Tag }, { key: "activity", label: "My Activity", icon: Activity },
  { key: "saved", label: "Saved Deals", icon: BookmarkCheck }, { key: "notifications", label: "Notifications", icon: Bell },
];

export function ProfileDashboard({ tab, edit = false }: { tab: Tab; edit?: boolean }) {
  const [data, setData] = useState<Dashboard | null>(null), [error, setError] = useState(""), [editing, setEditing] = useState(edit);
  const load = useCallback(() => call<Dashboard>("/api/v1/customer/dashboard").then((d) => { setData(d); setError(""); }).catch((e) => setError(msg(e))), []);
  useEffect(() => { const t = setTimeout(() => { void load(); }, 0); return () => clearTimeout(t); }, [load]);

  if (error) return <div className={styles.page}><p className={styles.err} role="alert">{error}</p></div>;
  if (!data) return <div className={styles.page} aria-busy="true"><div className={styles.skeleton} /><div className={styles.skeleton} /></div>;
  const { account, forum, stats } = data;
  const shownName = forum?.displayName || account.name;
  const avatar = forum?.hasAvatar ? `/api/v1/avatars/${forum.handle}` : null;
  const since = new Date(account.memberSince).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
  const statItems: { icon: typeof Tag; tone: string; value: string; label: string }[] = [
    { icon: Tag, tone: "", value: number(stats.submitted), label: "Deals Submitted" },
    { icon: CircleCheck, tone: "green", value: number(stats.approved), label: "Approved" },
    { icon: Zap, tone: "amber", value: number(stats.live), label: "Live Deals" },
    { icon: Eye, tone: "blue", value: number(stats.views), label: "Total Views" },
    { icon: Heart, tone: "red", value: number(stats.helpfulVotes), label: "Helpful Votes" },
    { icon: Trophy, tone: "amber", value: stats.badges ? number(stats.badges) : "0", label: "Badges" },
  ];
  const editHref = tab === "profile" ? undefined : "/account?edit=1";

  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-label="Your profile">
        <div className={styles.heroMain}>
          <div className={styles.avatarWrap}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {avatar ? <img className={styles.avatar} src={avatar} alt="Your profile photo" /> : <span className={styles.avatar} aria-hidden><UserRound size={44} /></span>}
            {editHref ? <Link href={editHref} className={styles.camera} aria-label="Change profile picture"><Camera size={16} aria-hidden /></Link>
              : <button type="button" className={styles.camera} aria-label="Change profile picture" onClick={() => setEditing(true)}><Camera size={16} aria-hidden /></button>}
          </div>
          <div className={styles.who}>
            <h1 className={styles.name}>{shownName}{forum?.verified && <VerifiedBadge size={22} />}</h1>
            {forum && <span className={styles.handle}>@{forum.handle}</span>}
            <div className={styles.chips}>
              <span className={styles.chip}><Users size={14} aria-hidden /> Community Member</span>
              <span className={styles.meta}><Calendar size={14} aria-hidden /> Member since {since}</span>
            </div>
            {forum?.bio && <p className={styles.bio}>{forum.bio}</p>}
          </div>
        </div>
        <div className={styles.heroActions}>
          <Link href="/account?tab=deals" className={styles.btn}><Tag size={16} aria-hidden /> Post a Deal</Link>
          <Link href="/" className={styles.btnLight}><LayoutGrid size={16} aria-hidden /> Explore Deals</Link>
          {editHref ? <Link href={editHref} className={styles.btnLight}><PenLine size={16} aria-hidden /> Edit Profile</Link>
            : <button type="button" className={styles.btnLight} onClick={() => setEditing((v) => !v)}><PenLine size={16} aria-hidden /> Edit Profile</button>}
        </div>
      </section>

      <section className={styles.stats} aria-label="Contribution statistics">
        {statItems.map(({ icon: Icon, tone, value, label }) => (
          <div className={styles.stat} key={label}><span className={`${styles.statIcon} ${tone ? styles[tone] : ""}`}><Icon size={20} aria-hidden /></span><span><strong>{value}</strong><small>{label}</small></span></div>
        ))}
      </section>

      <div className={styles.layout}>
        <nav className={styles.side} aria-label="Profile sections">
          {TABS.map(({ key, label, icon: Icon }) => (
            <Link key={key} href={key === "profile" ? "/account" : `/account?tab=${key}`} aria-current={tab === key ? "page" : undefined}>
              <Icon size={18} aria-hidden /> {label}{key === "notifications" && data.unreadNotifications > 0 ? ` (${data.unreadNotifications})` : ""}
            </Link>
          ))}
        </nav>
        <div className={styles.content}>
          {tab === "profile" && <>
            {editing && forum && <section className={styles.card} aria-label="Edit profile"><div className={styles.cardHead}><h2>Edit Profile</h2><button type="button" className={styles.link} onClick={() => { setEditing(false); void load(); }}>Done</button></div><EditProfile /></section>}
            <AboutMe data={data} onSaved={load} />
            <section className={styles.card} aria-label="Badges">
              <div className={styles.cardHead}><h2>My Badges ({stats.badges})</h2></div>
              <BadgeBoard board={data.badgeBoard} />
            </section>
            <Security data={data} />
            <Blocked />
            <Highlights data={data} />
            <Privacy data={data} />
          </>}
          {tab === "deals" && <CustomerProfile section="deals" embedded />}
          {tab === "activity" && <MyActivity />}
          {tab === "saved" && <SavedDeals />}
          {tab === "notifications" && <><Notifications onChange={load} /><Preferences data={data} onSaved={load} /></>}
        </div>
      </div>
    </div>
  );
}

function Row({ icon: Icon, title, text, children }: { icon: typeof User; title: string; text?: ReactNode; children?: ReactNode }) {
  return <div className={styles.line}><div className={styles.fact}><span className={styles.factIcon}><Icon size={18} aria-hidden /></span><div className={styles.txt}><b>{title}</b>{text && <span>{text}</span>}</div></div>{children}</div>;
}

function AboutMe({ data, onSaved }: { data: Dashboard; onSaved: () => Promise<void> }) {
  const { account, forum } = data;
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [say, setSay] = useState<Say>(null);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setSay(null);
    const f = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await call("/api/v1/customer/profile", "PATCH", { name: f.name, sex: f.sex || null, dateOfBirth: f.dateOfBirth || "", location: String(f.location ?? "") });
      // The bio is public, so it lives on the community profile; only that field is sent and the rest of it is untouched.
      if (forum && String(f.bio ?? "").trim() !== (forum.bio ?? "")) await call("/api/v1/customer/community/profile", "PATCH", { bio: String(f.bio ?? "").trim() });
      await onSaved(); setOpen(false); setSay({ ok: true, text: "Your details were saved." });
    } catch (error) { setSay({ ok: false, text: msg(error) }); } finally { setBusy(false); }
  }
  const val = (v: string | null) => v || "Not set";
  return (
    <section className={styles.card} aria-label="About me">
      <div className={styles.cardHead}><h2>About Me</h2>{!open && <button type="button" className={styles.link} aria-label="Edit About Me" onClick={() => { setOpen(true); setSay(null); }}><PenLine size={16} aria-hidden /> Edit</button>}</div>
      {!open ? <>
        <div className={styles.facts}>
          <Row icon={User} title="Name" text={account.name} />
          <Row icon={Calendar} title="Date of Birth" text={val(account.dateOfBirth ? new Date(account.dateOfBirth).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null)} />
          <Row icon={MapPin} title="City / State" text={val(account.location)} />
          <Row icon={Users} title="Gender" text={account.sex && account.sex in SEX_LABELS ? SEX_LABELS[account.sex as keyof typeof SEX_LABELS] : "Not set"} />
        </div>
        <div className={styles.bioBox}><b>Bio</b><p>{forum?.bio || "No bio yet. Use Edit to add one."}</p></div>
        <p className={styles.hint} style={{ marginTop: 10 }}>Your date of birth and gender are private and never shown on your public profile. Your user name, display name, bio, photo and City / State are public.</p>
      </> : (
        <form className={styles.form} onSubmit={save}>
          <label>Name<input name="name" defaultValue={account.name} required minLength={2} maxLength={80} autoComplete="name" /></label>
          <label>City / State<input name="location" defaultValue={account.location ?? ""} maxLength={80} placeholder="e.g. Chennai, Tamil Nadu" /></label>
          <label>Date of birth<input name="dateOfBirth" type="date" defaultValue={account.dateOfBirth ?? ""} /></label>
          <label>Gender<select name="sex" defaultValue={account.sex ?? ""}><option value="">Not set</option>{SEX_VALUES.map((v) => <option key={v} value={v}>{SEX_LABELS[v]}</option>)}</select></label>
          {forum && <label>Bio<textarea name="bio" defaultValue={forum.bio ?? ""} maxLength={280} rows={3} placeholder="A short line about you (shown on your public profile)" style={{ border: "1px solid var(--md-purple-200)", borderRadius: 10, padding: "10px 12px", font: "inherit", fontWeight: 400, resize: "vertical" }} /><span className={styles.hint}>Up to 280 characters. Your bio is public.</span></label>}
          <div className={styles.row}><button className={styles.btn} disabled={busy}>{busy ? "Saving…" : "Save"}</button><button type="button" className={styles.btnGhost} onClick={() => setOpen(false)}>Cancel</button></div>
        </form>
      )}
      <Notice say={say} />
    </section>
  );
}

function Security({ data }: { data: Dashboard }) {
  const { account } = data;
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [say, setSay] = useState<Say>(null);
  async function change(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setSay(null);
    const form = e.currentTarget, f = Object.fromEntries(new FormData(form));
    if (f.newPassword !== f.confirm) { setBusy(false); return setSay({ ok: false, text: "The new passwords do not match." }); }
    try { await call("/api/v1/customer/password", "POST", { currentPassword: f.currentPassword, newPassword: f.newPassword }); form.reset(); setOpen(false); setSay({ ok: true, text: "Password changed. Any signed-in MetaDeals4U app will ask you to sign in again." }); }
    catch (error) { setSay({ ok: false, text: msg(error) }); } finally { setBusy(false); }
  }
  return (
    <section className={styles.card} aria-label="Account and security">
      <div className={styles.cardHead}><h2>Account &amp; Security</h2></div>
      <div className={styles.list}>
        <Row icon={Mail} title="Email" text={account.email}>{account.emailVerified ? <span className={styles.verified}><ShieldCheck size={14} aria-hidden /> Verified</span> : <span className={styles.warn}>Not verified</span>}</Row>
        <Row icon={ShieldCheck} title="Two-Factor Authentication (2FA)" text="Not available for member accounts yet. Staff accounts already require it."><span className={styles.warn}>Coming soon</span></Row>
        <Row icon={Lock} title="Password" text={account.hasPassword ? "Protected with a password" : "You sign in with Google or Apple"}>
          {account.hasPassword ? <button type="button" className={styles.btnGhost} onClick={() => { setOpen((v) => !v); setSay(null); }}>{open ? "Cancel" : "Change"}</button> : <Link className={styles.btnGhost} href="/account">Set via Forgot password</Link>}
        </Row>
      </div>
      {open && <form className={styles.form} onSubmit={change} style={{ marginTop: 12 }}>
        <label>Current password<input name="currentPassword" type="password" required autoComplete="current-password" /></label>
        <label>New password<input name="newPassword" type="password" required minLength={8} maxLength={128} autoComplete="new-password" /><span className={styles.hint}>At least 8 characters. Avoid common passwords.</span></label>
        <label>Confirm new password<input name="confirm" type="password" required autoComplete="new-password" /></label>
        <div className={styles.row}><button className={styles.btn} disabled={busy}>{busy ? "Saving…" : "Change password"}</button></div>
      </form>}
      <Notice say={say} />
    </section>
  );
}

function Preferences({ data, onSaved }: { data: Dashboard; onSaved: () => Promise<void> }) {
  const [prefs, setPrefs] = useState(data.preferences), [cats, setCats] = useState<{ slug: string; name: string }[] | null>(null), [say, setSay] = useState<Say>(null), [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/v1/catalog").then((r) => r.json()).then((b: { categories: { slug: string; name: string; parentId: string | null }[] }) => { if (alive) setCats(b.categories.filter((c) => !c.parentId).map(({ slug, name }) => ({ slug, name }))); }).catch(() => { if (alive) setCats([]); });
    return () => { alive = false; };
  }, []);
  async function save(patch: Partial<Dashboard["preferences"]>) {
    const before = prefs; setPrefs({ ...prefs, ...patch }); setBusy(true); setSay(null);
    try { setPrefs(await call<Dashboard["preferences"]>("/api/v1/customer/preferences", "PATCH", patch)); setSay({ ok: true, text: "Preferences saved." }); void onSaved(); }
    catch (error) { setPrefs(before); setSay({ ok: false, text: msg(error) }); } finally { setBusy(false); }
  }
  const toggle = (id: string, label: string, text: string, value: boolean, key: "dealAlerts" | "emailUpdates", icon: typeof Bell) => (
    <Row icon={icon} title={label} text={text}><label className={styles.switch}><input type="checkbox" role="switch" aria-label={label} checked={value} disabled={busy} onChange={(e) => void save({ [key]: e.target.checked })} /><i /></label></Row>
  );
  return (
    <section className={styles.card} id="preferences" aria-label="Personal preferences">
      <div className={styles.cardHead}><h2>Personal Preferences</h2></div>
      <div className={styles.list}>
        {toggle("a", "Deal Alerts", "Get notified about deals you care about", prefs.dealAlerts, "dealAlerts", Bell)}
        <div className={styles.catBox} role="group" aria-labelledby="pref-cats" aria-disabled={!prefs.dealAlerts}>
          <div className={styles.cardHead} style={{ marginBottom: 4 }}>
            <b id="pref-cats" style={{ fontSize: 14 }}>Which categories? {prefs.categorySlugs.length ? `(${prefs.categorySlugs.length} selected)` : "(all categories)"}</b>
            <span className={styles.row}>
              {cats && cats.length > 0 && <button type="button" className={styles.link} disabled={busy || !prefs.dealAlerts || prefs.categorySlugs.length === cats.length} onClick={() => void save({ categorySlugs: cats.map((c) => c.slug) })}>Select all</button>}
              {prefs.categorySlugs.length > 0 && <button type="button" className={styles.link} disabled={busy || !prefs.dealAlerts} onClick={() => void save({ categorySlugs: [] })}>Clear</button>}
            </span>
          </div>
          <p className={styles.hint} style={{ margin: "0 0 10px" }}>{prefs.dealAlerts ? "Tick the categories you want deal alerts for. If you tick none, you get alerts for every category." : "Turn on Deal Alerts to choose categories."}</p>
          <div className={styles.catGrid}>
            {(cats ?? []).map((c) => { const on = prefs.categorySlugs.includes(c.slug); return (
              <label key={c.slug} className={styles.check}><input type="checkbox" checked={on} disabled={busy || !prefs.dealAlerts} onChange={() => void save({ categorySlugs: on ? prefs.categorySlugs.filter((x) => x !== c.slug) : [...prefs.categorySlugs, c.slug] })} /><span>{c.name}</span></label>
            ); })}
            {cats && !cats.length && <span className={styles.hint}>No categories available yet.</span>}{!cats && <span className={styles.hint}>Loading categories…</span>}
          </div>
        </div>
        {toggle("b", "Email Updates", "Deal summaries and community updates", prefs.emailUpdates, "emailUpdates", Mail)}
        <Row icon={Bell} title="Notification Frequency" text={FREQ_LABEL[prefs.frequency]}>
          <select aria-label="Notification frequency" value={prefs.frequency} disabled={busy} onChange={(e) => void save({ frequency: e.target.value as Dashboard["preferences"]["frequency"] })} style={{ minHeight: 40, borderRadius: 10 }}>
            {(Object.keys(FREQ_LABEL) as (keyof typeof FREQ_LABEL)[]).map((k) => <option key={k} value={k}>{FREQ_LABEL[k]}</option>)}
          </select>
        </Row>
      </div>
      <p className={styles.hint} style={{ marginTop: 10 }}>Your choices are saved to your account and will be respected by any alert or email we send. Security and account messages are always sent.</p>
      <Notice say={say} />
    </section>
  );
}

function Highlights({ data }: { data: Dashboard }) {
  const h = data.highlights;
  return (
    <section className={styles.card} aria-label="Activity highlights">
      <div className={styles.cardHead}><h2>My Activity Highlights</h2></div>
      <div className={styles.highlight}><Activity size={34} aria-hidden /><p className={styles.big}>You joined <b>{h.daysSinceJoining} {h.daysSinceJoining === 1 ? "day" : "days"}</b> ago.</p></div>
      <div className={styles.mini}>
        <div><strong>{h.discussions}</strong><small>Discussions</small></div><div><strong>{h.comments}</strong><small>Comments</small></div><div><strong>{h.dealsContributed}</strong><small>Deals shared</small></div>
      </div>
    </section>
  );
}

function Privacy({ data }: { data: Dashboard }) {
  return (
    <section className={styles.card} aria-label="Profile visibility and privacy">
      <div className={styles.cardHead}><h2>Profile visibility &amp; privacy</h2>{data.forum && <Link className={styles.link} href={`/community/u/${data.forum.handle}?public=1`}>View public profile</Link>}</div>
      <div className={styles.list}>
        <Row icon={Users} title="Public" text="User name, display name, bio, profile photo, member since, public location (if you add one), your published deals and discussions." />
        <Row icon={Lock} title="Always private" text="Email, date of birth, gender, password, notifications, saved deals and security settings. These are never shown to other members or returned by public APIs." />
      </div>
    </section>
  );
}

function Blocked() {
  const [items, setItems] = useState<{ handle: string; displayName: string | null }[] | null>(null), [say, setSay] = useState<Say>(null);
  const load = useCallback(() => fetch("/api/v1/messages/blocks", { cache: "no-store" }).then(async (r) => (r.ok ? (await r.json()).data.items : [])).then(setItems).catch(() => setItems([])), []);
  useEffect(() => { const t = setTimeout(() => { void load(); }, 0); return () => clearTimeout(t); }, [load]);
  async function unblock(handle: string) { try { await call(`/api/v1/messages/blocks/${encodeURIComponent(handle)}`, "DELETE"); await load(); } catch (e) { setSay({ ok: false, text: msg(e) }); } }
  return (
    <section className={styles.card} aria-label="Blocked members">
      <div className={styles.cardHead}><h2>Blocked members</h2></div>
      {items === null ? <p className={styles.hint}>Loading…</p> : !items.length ? <p className={styles.badgeEmpty}>You have not blocked anyone.</p> : (
        <div className={styles.list}>{items.map((b) => <div key={b.handle} className={styles.line}><div className={styles.txt}><b>{b.displayName || `@${b.handle}`}</b><span>@{b.handle}</span></div><button type="button" className={styles.btnGhost} onClick={() => void unblock(b.handle)}>Unblock</button></div>)}</div>
      )}
      <Notice say={say} />
    </section>
  );
}

type Saved = { id: string; slug: string; title: string; merchant: string; priceMinor: number; expired: boolean; image: string };
function SavedDeals() {
  const local = useSavedDeals();
  const [items, setItems] = useState<Saved[] | null>(null), [say, setSay] = useState<Say>(null), [busy, setBusy] = useState(false);
  const load = useCallback(() => call<Saved[]>("/api/v1/customer/saved-deals").then(setItems).catch((e) => { setItems([]); setSay({ ok: false, text: msg(e) }); }), []);
  useEffect(() => { const t = setTimeout(() => { void load(); }, 0); return () => clearTimeout(t); }, [load]);
  async function remove(id: string) { try { await call("/api/v1/customer/saved-deals", "DELETE", { dealId: id }); if (local.ids.includes(id)) local.toggle(id); await load(); } catch (e) { setSay({ ok: false, text: msg(e) }); } }
  async function importLocal() {
    setBusy(true); setSay(null); let done = 0;
    for (const id of local.ids) { try { await call("/api/v1/customer/saved-deals", "POST", { dealId: id }); done++; } catch { /* a deal that is no longer public is skipped */ } }
    await load(); setBusy(false); setSay({ ok: true, text: `${done} saved ${done === 1 ? "deal" : "deals"} added to your account.` });
  }
  const unsynced = local.ids.filter((id) => !(items ?? []).some((i) => i.id === id));
  return (
    <section className={styles.card} aria-label="Saved deals">
      <div className={styles.cardHead}><h2>Saved Deals</h2></div>
      {unsynced.length > 0 && <div className={styles.info} style={{ marginBottom: 12 }}>{unsynced.length} deal{unsynced.length === 1 ? " is" : "s are"} saved only on this browser. <button type="button" className={styles.link} disabled={busy} onClick={() => void importLocal()}>Add to my account</button></div>}
      {items === null ? <p className={styles.hint}>Loading…</p> : !items.length ? <p className={styles.empty}>No saved deals yet. Tap the heart on a deal to keep it here.</p> : (
        <div className={styles.list}>{items.map((d) => (
          <div className={styles.deal} key={d.id}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={d.image} alt="" loading="lazy" />
            <div><b>{d.title}</b><span>{d.merchant} · ₹{(d.priceMinor / 100).toLocaleString("en-IN")}{d.expired ? " · Expired" : ""}</span></div>
            <div className={styles.row}><Link className={styles.btnGhost} href={`/deal/${d.slug}`}>View</Link><button type="button" className={styles.btnGhost} onClick={() => void remove(d.id)} aria-label={`Remove ${d.title}`}>Remove</button></div>
          </div>
        ))}</div>
      )}
      <Notice say={say} />
    </section>
  );
}

type Notice = { id: string; type: NotificationType; postSlug: string; postTitle: string; commentId: string | null; actor: string | null; read: boolean; createdAt: string };
function Notifications({ onChange }: { onChange: () => Promise<void> }) {
  const [items, setItems] = useState<Notice[] | null>(null), [say, setSay] = useState<Say>(null);
  const load = useCallback(() => call<{ items: Notice[] }>("/api/v1/community/notifications").then((d) => setItems(d.items)).catch(() => { setItems([]); }), []);
  useEffect(() => { const t = setTimeout(() => { void load(); }, 0); return () => clearTimeout(t); }, [load]);
  async function mark(ids?: string[]) { try { await call("/api/v1/community/notifications/read", "POST", ids ? { ids } : {}); await load(); await onChange(); } catch (e) { setSay({ ok: false, text: msg(e) }); } }
  const href = (n: Notice) => (n.type === "MODERATION_WARNING" || n.type === "POSTING_RESTRICTED" || n.type === "APPEAL_DECIDED" ? "/community/moderation" : n.type === "MESSAGE" ? `/messages?t=${n.postSlug}` : `/community/post/${n.postSlug}`);
  const unread = (items ?? []).filter((n) => !n.read).length;
  return (
    <section className={styles.card} aria-label="Notifications">
      <div className={styles.cardHead}><h2>Notifications</h2><div className={styles.row}>{unread > 0 && <button type="button" className={styles.link} onClick={() => void mark()}>Mark all as read</button>}</div></div>
      {items === null ? <p className={styles.hint}>Loading…</p> : !items.length ? <p className={styles.empty}>No notifications yet.</p> : (
        <div className={styles.list}>{items.map((n) => (
          <div className={styles.line} key={n.id} style={n.read ? undefined : { fontWeight: 700 }}>
            <div className={styles.txt}><Link href={href(n)} onClick={() => { if (!n.read) void mark([n.id]); }}>{notificationText(n.type, n.actor)}</Link><span>{n.postTitle} · {new Date(n.createdAt).toLocaleDateString("en-IN")}</span></div>
            {!n.read && <button type="button" className={styles.btnGhost} onClick={() => void mark([n.id])}>Mark read</button>}
          </div>
        ))}</div>
      )}
      <Notice say={say} />
    </section>
  );
}
