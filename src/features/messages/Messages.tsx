"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, CheckCheck, Clock, MessageSquarePlus, MoreVertical, Paperclip, Search, SendHorizontal, BellOff } from "lucide-react";
import { linkifyParts, REPORT_CATEGORIES, REPORT_LABELS } from "@/features/community/validation";
import { onLive } from "./live";
import { VerifiedBadge } from "@/features/profile/VerifiedBadge";
import styles from "./messages.module.css";

type Member = { handle: string; displayName: string | null; verified?: boolean; avatarUrl: string | null; online: boolean };
type Share =
  | { kind: "DEAL"; id: string; title: string; imageUrl: string; priceMinor: number; mrpMinor: number; discountPercent: number; merchant: string; url: string; unavailable?: undefined }
  | { kind: "DISCUSSION"; id: string; title: string; author: string; excerpt: string; url: string; shortUrl: string; unavailable?: undefined }
  | { kind: "DEAL" | "DISCUSSION"; unavailable: true };
type Status = "sending" | "sent" | "delivered" | "read" | "failed";
type Msg = { id: string; mine: boolean; kind: string; body: string | null; share: Share | null; createdAt: string; clientId?: string | null; status?: Status; error?: string; retry?: { body?: string; share?: { kind: "DEAL" | "DISCUSSION"; id: string } } };
type Row = { id: string; other: Member; lastMessageAt: string; unread: number; muted: boolean; archived: boolean; blockedByMe: boolean; last: { excerpt: string; mine: boolean; createdAt: string; status?: Status } };
type Meta = { id: string; other: Member; muted: boolean; archived: boolean; iBlocked: boolean; canReply: boolean };
type Option = { kind: "DEAL" | "DISCUSSION"; id: string; label: string; card: Share };

const rupees = (minor: number) => `₹${(minor / 100).toLocaleString("en-IN")}`;
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
const dayKey = (iso: string) => new Date(iso).toDateString();
function dayLabel(iso: string) {
  const d = new Date(iso), today = new Date(), yesterday = new Date(Date.now() - 86_400_000);
  return d.toDateString() === today.toDateString() ? "Today" : d.toDateString() === yesterday.toDateString() ? "Yesterday" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}
const listTime = (iso: string) => (dayLabel(iso) === "Today" ? clock(iso) : dayLabel(iso));
const newClientId = () => ("c" + (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random()}`).replace(/[^A-Za-z0-9]/g, "")).slice(0, 36);
const api = async (url: string, method = "GET", body?: unknown) => {
  const r = await fetch(url, { method, cache: "no-store", ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
  return { ok: r.ok, status: r.status, body: await r.json().catch(() => null) };
};
/** Adds or replaces a message (matched by id, or by the id this device gave it while sending) and keeps the list in time order. */
function upsert(list: Msg[], m: Msg) {
  const i = list.findIndex((x) => x.id === m.id || (m.clientId && (x.id === m.clientId || x.clientId === m.clientId)));
  const next = i >= 0 ? list.map((x, n) => (n === i ? m : x)) : [...list, m];
  return next.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function Face({ member, size = 44 }: { member: Member; size?: number }) {
  return (
    <span className={styles.avatarWrap}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {member.avatarUrl ? <img className={styles.avatar} src={member.avatarUrl} alt="" width={size} height={size} style={{ width: size, height: size }} /> : <span className={styles.avatar} aria-hidden style={{ width: size, height: size }}>{member.handle.slice(0, 1).toUpperCase()}</span>}
      {member.online && <span className={styles.dot} title="Online" />}
    </span>
  );
}
const nameOf = (m: Member) => m.displayName || m.handle;

function Ticks({ status }: { status?: Status }) {
  if (status === "sending") return <Clock size={13} aria-label="Sending" />;
  if (status === "failed") return <span className={styles.failed}>Not sent</span>;
  if (status === "read") return <CheckCheck size={15} className={styles.read} aria-label="Read" />;
  if (status === "delivered") return <CheckCheck size={15} aria-label="Delivered" />;
  return <Check size={15} aria-label="Sent" />;
}

function ShareCard({ share }: { share: Share }) {
  if (share.unavailable) return <span className={styles.shareCard}><div><strong>{share.kind === "DEAL" ? "This deal is no longer available" : "This discussion is no longer available"}</strong></div></span>;
  if (share.kind === "DEAL") return (
    <Link href={share.url} className={styles.shareCard}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={share.imageUrl} alt="" loading="lazy" />
      <div><strong>{share.title}</strong><span>{rupees(share.priceMinor)}{share.mrpMinor > share.priceMinor ? ` (MRP ${rupees(share.mrpMinor)}, ${share.discountPercent}% off)` : ""} at {share.merchant}</span><em>View deal</em></div>
    </Link>
  );
  return <Link href={share.url} className={styles.shareCard}><div><strong>{share.title}</strong><span>by {share.author}{share.excerpt ? `: ${share.excerpt}` : ""}</span><em>Open discussion</em></div></Link>;
}

export function Messages({ to, thread }: { to?: string; thread?: string }) {
  const [rows, setRows] = useState<Row[]>([]), [unread, setUnread] = useState({ messages: 0, conversations: 0 }), [filter, setFilter] = useState<"all" | "unread" | "archived">("all"), [q, setQ] = useState("");
  const [loaded, setLoaded] = useState(false), [listError, setListError] = useState("");
  const [activeId, setActiveId] = useState<string | null>(thread ?? null), [draftTo, setDraftTo] = useState<{ member: Member; canMessage: boolean } | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null), [msgs, setMsgs] = useState<Msg[]>([]), [hasMore, setHasMore] = useState(false), [chatError, setChatError] = useState("");
  const [text, setText] = useState(""), [typing, setTyping] = useState(false), [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState<null | "share" | { report: Msg }>(null), [picking, setPicking] = useState(false);
  const [found, setFound] = useState<Member[]>([]), [memberQ, setMemberQ] = useState("");
  const [shareTab, setShareTab] = useState<"DEAL" | "DISCUSSION">("DEAL"), [shareQ, setShareQ] = useState(""), [options, setOptions] = useState<Option[]>([]);
  const [reportCategory, setReportCategory] = useState<(typeof REPORT_CATEGORIES)[number]>("SPAM"), [reportDetails, setReportDetails] = useState(""), [notice, setNotice] = useState("");
  const activeRef = useRef(activeId), needsRead = useRef(false), log = useRef<HTMLDivElement>(null), lastTyping = useRef(0), filterRef = useRef(filter);
  useEffect(() => { activeRef.current = activeId; filterRef.current = filter; }, [activeId, filter]);

  const loadList = useCallback(async () => {
    const r = await api(`/api/v1/messages/threads?filter=${filterRef.current}`).catch(() => null);
    if (!r?.ok) { setListError(r?.body?.error ?? "Could not load your messages."); setLoaded(true); return; }
    setRows(r.body.data.items); setUnread({ messages: r.body.data.unread, conversations: r.body.data.unreadConversations }); setListError(""); setLoaded(true);
  }, []);

  /** Tells the server the conversation was actually seen: only while this tab is visible and focused. */
  const maybeRead = useCallback(() => {
    const id = activeRef.current;
    if (!id || !needsRead.current || document.visibilityState !== "visible" || !document.hasFocus()) return;
    needsRead.current = false;
    setRows((list) => list.map((row) => (row.id === id ? { ...row, unread: 0 } : row)));
    void api(`/api/v1/messages/threads/${id}/read`, "POST").then(() => loadList());
  }, [loadList]);

  const loadThread = useCallback(async (id: string) => {
    const r = await api(`/api/v1/messages/threads/${id}`).catch(() => null);
    if (activeRef.current !== id) return;
    if (!r?.ok) { setChatError(r?.body?.error ?? "Could not load this conversation."); setMeta(null); setMsgs([]); return; }
    setChatError(""); setMeta(r.body.data.thread); setHasMore(r.body.data.hasMore);
    // Messages still being sent from this device stay on screen until the server copy replaces them.
    setMsgs((old) => old.filter((m) => m.status === "sending" || m.status === "failed").reduce(upsert, r.body.data.messages as Msg[]));
    needsRead.current = (r.body.data.messages as Msg[]).some((m) => !m.mine);
    maybeRead();
  }, [maybeRead]);

  const openWith = useCallback(async (handle: string) => {
    const r = await api(`/api/v1/messages/with/${encodeURIComponent(handle)}`).catch(() => null);
    if (!r?.ok) { setListError(r?.body?.error ?? "Member not found."); return; }
    setPicking(false); setMemberQ(""); setFound([]);
    if (r.body.data.threadId) { setDraftTo(null); setActiveId(r.body.data.threadId); }
    else { setActiveId(null); setMeta(null); setMsgs([]); setDraftTo({ member: r.body.data.member, canMessage: r.body.data.canMessage }); }
  }, []);

  useEffect(() => { const first = setTimeout(() => { void loadList(); if (to) void openWith(to); }, 0); return () => clearTimeout(first); }, [loadList, openWith, to]);
  useEffect(() => { if (loaded) void loadList(); }, [filter, loaded, loadList]);
  useEffect(() => {
    if (!activeId) return;
    const start = setTimeout(() => { setMenu(false); setSheet(null); setTyping(false); setMsgs([]); void loadThread(activeId); }, 0);
    window.history.replaceState(null, "", `/messages?t=${activeId}`);
    return () => clearTimeout(start);
  }, [activeId, loadThread]);
  useEffect(() => {
    window.addEventListener("focus", maybeRead); document.addEventListener("visibilitychange", maybeRead);
    return () => { window.removeEventListener("focus", maybeRead); document.removeEventListener("visibilitychange", maybeRead); };
  }, [maybeRead]);

  // Live events. Each one is a hint that something changed in the database; lists are re-read from the API.
  useEffect(() => onLive((type, d) => {
    const id = activeRef.current, tid = d.threadId as string | undefined;
    if (type === "ready") { void loadList(); if (id) void loadThread(id); return; }
    if (type === "message") {
      const m = d.message as Msg;
      if (tid === id) { setMsgs((list) => upsert(list, m)); if (!m.mine) { setTyping(false); needsRead.current = true; maybeRead(); } }
      void loadList(); return;
    }
    if (type === "typing") { if (tid === id) setTyping(true); return; }
    if (type === "thread") { void loadList(); if (tid === id && id) void loadThread(id); return; }
    const at = d.at as string;
    if (tid === id && (type === "delivered" || (type === "read" && d.by === "other")))
      setMsgs((list) => list.map((m) => (m.mine && m.createdAt <= at && m.status !== "sending" && m.status !== "failed" && (type === "read" || m.status === "sent") ? { ...m, status: type === "read" ? "read" : "delivered" } : m)));
    if (type === "read") void loadList();
  }), [loadList, loadThread, maybeRead]);

  useEffect(() => { if (!typing) return; const t = setTimeout(() => setTyping(false), 4000); return () => clearTimeout(t); }, [typing, msgs.length]);
  useEffect(() => { const el = log.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs.length, typing, activeId]);

  // Member search for a new conversation, and the deal / discussion picker.
  useEffect(() => {
    if (!picking || memberQ.trim().length < 2) return;
    const t = setTimeout(() => { void api(`/api/v1/messages/members?q=${encodeURIComponent(memberQ.trim())}`).then((r) => setFound(r.ok ? r.body.data.items : [])); }, 250);
    return () => clearTimeout(t);
  }, [memberQ, picking]);
  useEffect(() => {
    if (sheet !== "share") return;
    const t = setTimeout(async () => {
      if (shareTab === "DEAL") {
        const r = await api(`/api/v1/mobile/deals?view=latest&limit=6&q=${encodeURIComponent(shareQ.trim())}`).catch(() => null);
        setOptions(r?.ok && r.body.source !== "demo" ? (r.body.data as { id: string; title: string; price: number; mrp: number; discountPercent: number; imageUrl: string; slug: string; merchant: { name: string } }[]).map((x) => ({ kind: "DEAL" as const, id: x.id, label: `${x.title} · ₹${x.price.toLocaleString("en-IN")}`, card: { kind: "DEAL" as const, id: x.id, title: x.title, imageUrl: x.imageUrl, priceMinor: x.price * 100, mrpMinor: x.mrp * 100, discountPercent: x.discountPercent, merchant: x.merchant.name, url: `/deal/${x.slug}` } })) : []);
      } else {
        const r = await api(`/api/v1/community/discussions?limit=6&q=${encodeURIComponent(shareQ.trim())}`).catch(() => null);
        setOptions(r?.ok ? ((r.body.data?.items ?? []) as { id: string; slug: string; title: string; body: string; author: { handle: string } }[]).map((x) => ({ kind: "DISCUSSION" as const, id: x.id, label: x.title, card: { kind: "DISCUSSION" as const, id: x.id, title: x.title, author: x.author.handle, excerpt: x.body.slice(0, 140), url: `/community/post/${x.slug}`, shortUrl: `/p/${x.slug.slice(-6)}` } })) : []);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [sheet, shareTab, shareQ]);

  async function send(payload: { body?: string; share?: { kind: "DEAL" | "DISCUSSION"; id: string } }, card: Share | null, again?: Msg) {
    if (!activeId && !draftTo) return;
    const clientId = again?.clientId ?? newClientId();
    const local: Msg = { id: clientId, clientId, mine: true, kind: payload.share?.kind ?? "TEXT", body: payload.body ?? "", share: card, createdAt: again?.createdAt ?? new Date().toISOString(), status: "sending", retry: payload };
    setMsgs((list) => upsert(list, local));
    const r = await api(activeId ? `/api/v1/messages/threads/${activeId}/messages` : "/api/v1/messages/threads", "POST", { ...(activeId ? {} : { handle: draftTo!.member.handle }), ...payload, clientId }).catch(() => null);
    if (r?.ok) {
      // Stored on the server: only now does it count as sent.
      setMsgs((list) => upsert(list, r.body.data.message));
      if (!activeId) { activeRef.current = r.body.data.threadId; setDraftTo(null); setActiveId(r.body.data.threadId); }
      void loadList();
    } else setMsgs((list) => upsert(list, { ...local, status: "failed", error: r?.body?.error ?? "Check your connection and try again." }));
  }
  function submit() {
    const body = text.trim();
    if (!body) return;
    setText(""); void send({ body }, null);
  }
  function onType(value: string) {
    setText(value);
    if (activeId && value.trim() && Date.now() - lastTyping.current > 2000) { lastTyping.current = Date.now(); void api(`/api/v1/messages/threads/${activeId}/typing`, "POST").catch(() => {}); }
  }
  async function older() {
    if (!activeId || !msgs.length) return;
    const r = await api(`/api/v1/messages/threads/${activeId}?before=${encodeURIComponent(msgs[0].createdAt)}`).catch(() => null);
    if (r?.ok) { setHasMore(r.body.data.hasMore); setMsgs((list) => (r.body.data.messages as Msg[]).reduce(upsert, list)); }
  }
  async function setting(change: { muted?: boolean; archived?: boolean }) {
    if (!activeId) return;
    setMenu(false);
    const r = await api(`/api/v1/messages/threads/${activeId}`, "PATCH", change).catch(() => null);
    if (r?.ok) { setMeta((m) => (m ? { ...m, ...r.body.data } : m)); void loadList(); if (change.archived) closeChat(); } else setChatError(r?.body?.error ?? "Could not update the conversation.");
  }
  async function remove() {
    if (!activeId) return;
    setMenu(false);
    if (!window.confirm("Delete this conversation from your inbox? The other member keeps their copy.")) return;
    const r = await api(`/api/v1/messages/threads/${activeId}`, "DELETE").catch(() => null);
    if (r?.ok) { closeChat(); void loadList(); } else setChatError(r?.body?.error ?? "Could not delete the conversation.");
  }
  async function block(next: boolean) {
    const handle = meta?.other.handle;
    if (!handle) return;
    setMenu(false);
    if (next && !window.confirm(`Block ${handle}? Neither of you will be able to message the other.`)) return;
    const r = await api(`/api/v1/messages/blocks/${handle}`, next ? "PUT" : "DELETE").catch(() => null);
    if (r?.ok && activeId) void loadThread(activeId); else if (!r?.ok) setChatError(r?.body?.error ?? "Could not update the block.");
  }
  async function report(message: Msg) {
    const r = await api("/api/v1/messages/reports", "POST", { messageId: message.id, category: reportCategory, details: reportDetails || null }).catch(() => null);
    setSheet(null); setReportDetails("");
    setNotice(r?.ok ? (r.body.data.duplicate ? "You already reported this message. Thank you." : "Thank you. Our team will review this message.") : r?.body?.error ?? "Could not send the report.");
  }
  function closeChat() { setActiveId(null); setDraftTo(null); setMeta(null); setMsgs([]); setMenu(false); setSheet(null); window.history.replaceState(null, "", "/messages"); }

  const other = meta?.other ?? draftTo?.member ?? null;
  const canReply = meta ? meta.canReply : draftTo?.canMessage ?? false;
  const needle = q.trim().toLowerCase();
  const shown = needle ? rows.filter((row) => row.other.handle.includes(needle) || (row.other.displayName ?? "").toLowerCase().includes(needle)) : rows;
  const open = Boolean(activeId || draftTo);

  return (
    <div className={styles.frame} data-open={open}>
      <section className={styles.list} aria-label="Conversations">
        <div className={styles.listHead}>
          <h1>Messages</h1>{unread.messages > 0 && <span className={styles.badge} aria-label={`${unread.messages} unread messages`}>{unread.messages > 99 ? "99+" : unread.messages}</span>}
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setPicking((v) => !v)}><MessageSquarePlus size={16} aria-hidden /> New message</button>
        </div>
        {picking && (
          <div className={styles.picker}>
            <label className={styles.search}><Search size={16} aria-hidden /><input autoFocus value={memberQ} onChange={(e) => setMemberQ(e.target.value)} placeholder="Type a member's user name" aria-label="Find a member" maxLength={30} /></label>
            {memberQ.trim().length >= 2 && (found.length ? found.map((m) => <button key={m.handle} type="button" className={styles.rowBtn} onClick={() => void openWith(m.handle)}><Face member={m} size={36} /><span className={styles.who}><strong>{nameOf(m)}</strong><span>@{m.handle}</span></span></button>) : <span className={styles.err}>No member found with that name.</span>)}
          </div>
        )}
        <label className={styles.search}><Search size={16} aria-hidden /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search conversations…" aria-label="Search conversations" maxLength={60} /></label>
        <div className={styles.filters} role="tablist" aria-label="Filter conversations">
          {(["all", "unread", "archived"] as const).map((f) => <button key={f} type="button" role="tab" aria-selected={filter === f} className={`${styles.filter} ${filter === f ? styles.filterOn : ""}`} onClick={() => setFilter(f)}>{f === "all" ? "All" : f === "unread" ? `Unread${unread.conversations ? ` (${unread.conversations})` : ""}` : "Archived"}</button>)}
        </div>
        {listError && <p className={styles.err} role="alert">{listError}</p>}
        {!loaded ? <div className={styles.empty}>Loading…</div> : shown.length === 0 ? (
          <div className={styles.empty}><strong>{needle ? "No conversation matches" : filter === "archived" ? "No archived conversations" : filter === "unread" ? "You are all caught up" : "No messages yet"}</strong>{!needle && filter === "all" && <span>Start a conversation with any member from their profile, or with New message.</span>}</div>
        ) : (
          <ul className={styles.rows}>
            {shown.map((row) => (
              <li key={row.id}>
                <button type="button" className={`${styles.rowBtn} ${row.id === activeId ? styles.rowOn : ""}`} onClick={() => { setDraftTo(null); setActiveId(row.id); }}>
                  <Face member={row.other} />
                  <span className={styles.who}><strong>{nameOf(row.other)}{row.other.verified && <VerifiedBadge size={14} />}</strong><span className={row.unread ? styles.unreadText : ""}>{row.last.mine ? "You: " : ""}{row.last.excerpt}</span></span>
                  <span className={styles.side}><small>{listTime(row.last.createdAt)}</small>{row.unread > 0 ? <span className={styles.badge}>{row.unread > 99 ? "99+" : row.unread}</span> : row.muted ? <BellOff size={14} aria-label="Muted" /> : null}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.chat} aria-label="Conversation">
        {!other ? <div className={styles.empty}><strong>{chatError || (activeId ? "Loading…" : "Select a conversation")}</strong>{!chatError && !activeId && <span>Your messages are private between you and the other member.</span>}{activeId && chatError && <button type="button" className={styles.btn} onClick={closeChat}>Back to messages</button>}</div> : (
          <>
            <header className={styles.chatHead}>
              <button type="button" className={`${styles.icon} ${styles.back}`} aria-label="Back to messages" onClick={closeChat}><ArrowLeft size={20} /></button>
              <Link href={`/community/u/${other.handle}`}><Face member={other} size={40} /><span className={styles.who}><strong>{nameOf(other)}{other.verified && <VerifiedBadge size={14} />}</strong><small className={other.online ? styles.online : ""}>{typing ? "typing…" : other.online ? "Online" : `@${other.handle}`}</small></span></Link>
              {meta && <button type="button" className={styles.icon} aria-label="Conversation options" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)}><MoreVertical size={20} /></button>}
              {menu && meta && (
                <div className={styles.menu} role="menu">
                  <Link href={`/community/u/${other.handle}`} role="menuitem">View profile</Link>
                  <button type="button" role="menuitem" onClick={() => void setting({ muted: !meta.muted })}>{meta.muted ? "Unmute notifications" : "Mute notifications"}</button>
                  <button type="button" role="menuitem" onClick={() => void setting({ archived: !meta.archived })}>{meta.archived ? "Move back to inbox" : "Archive conversation"}</button>
                  <button type="button" role="menuitem" onClick={() => void block(!meta.iBlocked)}>{meta.iBlocked ? "Unblock member" : "Block member"}</button>
                  <button type="button" role="menuitem" className={styles.danger} onClick={() => void remove()}>Delete conversation</button>
                </div>
              )}
            </header>
            <div className={styles.log} ref={log} aria-live="polite">
              {hasMore && <button type="button" className={`${styles.btn} ${styles.more}`} onClick={() => void older()}>Load earlier messages</button>}
              {msgs.length === 0 && <div className={styles.empty}><span>{draftTo ? `Say hello to ${nameOf(other)}.` : "No messages to show."}</span></div>}
              {msgs.map((m, i) => (
                <div key={m.id} style={{ display: "contents" }}>
                  {(i === 0 || dayKey(msgs[i - 1].createdAt) !== dayKey(m.createdAt)) && <span className={styles.day}>{dayLabel(m.createdAt)}</span>}
                  <div className={`${styles.msg} ${m.mine ? styles.mine : ""}`}>
                    <div className={styles.bubble}>
                      {m.body === null ? <em>Message removed</em> : linkifyParts(m.body).map((part, n) => (part.href ? <a key={n} href={part.href} target="_blank" rel="nofollow ugc noopener noreferrer">{part.text}</a> : <span key={n}>{part.text}</span>))}
                      {m.share && <ShareCard share={m.share} />}
                    </div>
                    <div className={styles.meta}>
                      <span>{clock(m.createdAt)}</span>
                      {m.mine && <Ticks status={m.status} />}
                      {m.status === "failed" && <><span className={styles.failed}>{m.error}</span><button type="button" onClick={() => void send(m.retry ?? { body: m.body ?? "" }, m.share, m)}>Try again</button></>}
                      {!m.mine && m.body !== null && <button type="button" onClick={() => { setNotice(""); setSheet({ report: m }); }}>Report</button>}
                    </div>
                  </div>
                </div>
              ))}
              {typing && <span className={styles.typing}>{nameOf(other)} is typing…</span>}
            </div>
            {notice && <p className={styles.note} role="status">{notice}</p>}
            {chatError && <p className={styles.err} role="alert">{chatError}</p>}
            {sheet === "share" && (
              <div className={styles.sheet} role="dialog" aria-label="Share a deal or discussion">
                <div className={styles.sheetRow}>
                  <button type="button" className={`${styles.filter} ${shareTab === "DEAL" ? styles.filterOn : ""}`} onClick={() => { setShareTab("DEAL"); setOptions([]); }}>Deals</button>
                  <button type="button" className={`${styles.filter} ${shareTab === "DISCUSSION" ? styles.filterOn : ""}`} onClick={() => { setShareTab("DISCUSSION"); setOptions([]); }}>Discussions</button>
                  <button type="button" className={styles.filter} onClick={() => setSheet(null)}>Close</button>
                </div>
                <label className={styles.search} style={{ margin: 0 }}><Search size={16} aria-hidden /><input autoFocus value={shareQ} onChange={(e) => setShareQ(e.target.value)} placeholder={shareTab === "DEAL" ? "Search deals" : "Search discussions"} aria-label="Search" maxLength={80} /></label>
                {options.filter((o) => o.kind === shareTab).length ? <ul>{options.filter((o) => o.kind === shareTab).map((o) => <li key={o.id}><button type="button" onClick={() => { setSheet(null); void send({ share: { kind: o.kind, id: o.id }, ...(text.trim() ? { body: text.trim() } : {}) }, o.card); setText(""); }}>{o.label}</button></li>)}</ul> : <span className={styles.err}>Nothing to share matches.</span>}
              </div>
            )}
            {sheet && sheet !== "share" && (
              <div className={styles.sheet} role="dialog" aria-label="Report this message">
                <strong>Report this message</strong>
                <select value={reportCategory} onChange={(e) => setReportCategory(e.target.value as typeof reportCategory)} aria-label="What is wrong?">{REPORT_CATEGORIES.map((c) => <option key={c} value={c}>{REPORT_LABELS[c]}</option>)}</select>
                <textarea rows={2} maxLength={500} value={reportDetails} onChange={(e) => setReportDetails(e.target.value)} placeholder="More detail (optional)" aria-label="More detail" />
                <div className={styles.sheetRow}><button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => void report(sheet.report)}>Send report</button><button type="button" className={styles.btn} onClick={() => setSheet(null)}>Cancel</button></div>
                <span className={styles.err} style={{ color: "inherit", padding: 0 }}>Only this message is shared with our team. Reports are private.</span>
              </div>
            )}
            {canReply ? (
              <form className={styles.composer} onSubmit={(e) => { e.preventDefault(); submit(); }}>
                <button type="button" className={styles.icon} aria-label="Share a deal or discussion" onClick={() => setSheet((s) => (s === "share" ? null : "share"))}><Paperclip size={20} /></button>
                <textarea rows={1} value={text} maxLength={2000} placeholder="Type a message…" aria-label="Message" onChange={(e) => onType(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia("(pointer: fine)").matches) { e.preventDefault(); submit(); } }} />
                <button className={styles.send} aria-label="Send" disabled={!text.trim()}><SendHorizontal size={20} /></button>
              </form>
            ) : <p className={styles.note}>{meta?.iBlocked ? "You blocked this member. Unblock them from the menu to send messages." : "You cannot send messages in this conversation."}</p>}
          </>
        )}
      </section>
    </div>
  );
}
