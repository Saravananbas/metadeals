"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { TYPE_LABEL, ago } from "./parts";
import styles from "../community.module.css";

type Post = { id: string; slug: string; title: string; type: keyof typeof TYPE_LABEL; createdAt: string; score: number; commentCount: number; viewer?: { status: string; removalReason: string | null } };
type Activity = {
  profile: { handle: string; bio: string | null; status: string; suspendedUntil: string | null };
  counts: { published: number; awaitingReview: number; removed: number; deleted: number };
  posts: Post[]; comments: { id: string; excerpt: string; createdAt: string; post: { slug: string; title: string } }[]; saved: Post[];
  following: { slug: string; name: string }[]; reports: { id: string; targetType: string; category: string; status: string; createdAt: string }[];
};

export function MyActivity() {
  const [data, setData] = useState<Activity | null>(null);
  const [state, setState] = useState<"loading" | "signin" | "off" | "ok">("loading");
  const [say, setSay] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/v1/customer/community/activity", { cache: "no-store" }).then(async (response) => {
      if (!alive) return;
      if (response.status === 401) return setState("signin");
      if (response.status === 404) return setState("off");
      const body = await response.json();
      setData(body.data); setState("ok");
    }).catch(() => alive && setState("off"));
    return () => { alive = false; };
  }, []);

  if (state === "loading") return <p className={styles.notice}>Loading…</p>;
  if (state === "signin") return <div className={`${styles.card} ${styles.empty}`}>Please <Link href="/account">sign in</Link> to see your activity.</div>;
  if (state === "off" || !data) return <div className={`${styles.card} ${styles.empty}`}>Your activity is not available right now.</div>;

  return (
    <div className={styles.shell} style={{ padding: 0, margin: 0, width: "100%" }}>
      <section className={styles.tiles} aria-label="Your posts">
        <div className={styles.tile}><small>Live posts</small><strong>{data.counts.published}</strong></div>
        <div className={styles.tile}><small>Awaiting review</small><strong>{data.counts.awaitingReview}</strong></div>
        <div className={styles.tile}><small>Removed</small><strong>{data.counts.removed}</strong></div>
      </section>
      {data.profile.status === "SUSPENDED" && <div className={styles.err}>Your community access is paused{data.profile.suspendedUntil ? ` until ${new Date(data.profile.suspendedUntil).toLocaleDateString("en-IN")}` : ""}. Write to us if you think this is a mistake.</div>}

      <section className={styles.card}>
        <h2>Your community name</h2>
        <form className={styles.form} onSubmit={async (e) => {
          e.preventDefault();
          const values = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
          const response = await fetch("/api/v1/customer/community/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handle: values.handle, bio: values.bio || null }) });
          const body = await response.json().catch(() => ({}));
          if (response.ok) { setData({ ...data, profile: { ...data.profile, ...body.data } }); setSay({ ok: true, text: "Saved." }); } else setSay({ ok: false, text: body?.error ?? "Could not save" });
        }}>
          <div className={styles.row}>
            <label>Public name<input name="handle" defaultValue={data.profile.handle} required pattern="[a-zA-Z0-9_]{3,30}" /></label>
            <label>About you (optional)<input name="bio" defaultValue={data.profile.bio ?? ""} maxLength={280} /></label>
          </div>
          <p className={styles.notice}>This is the only name others see. Your email, real name and profile details stay private.</p>
          <div className={styles.actions}><button className={`${styles.btn} ${styles.btnPrimary}`}>Save</button>{say && <span className={say.ok ? styles.ok : styles.err} role="status">{say.text}</span>}</div>
        </form>
      </section>

      <section className={styles.card}>
        <h2>Your posts</h2>
        {data.posts.map((p) => (
          <div key={p.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--md-neutral-100)" }}>
            <Link href={`/community/post/${p.slug}`}>{p.title}</Link>
            <div className={styles.meta}><span>{TYPE_LABEL[p.type]}</span><span>{p.viewer?.status.replace("_", " ").toLowerCase()}</span><span>{ago(p.createdAt)}</span><span>{p.score} points · {p.commentCount} comments</span></div>
            {p.viewer?.removalReason && <p className={styles.notice}>Why it was removed: {p.viewer.removalReason}</p>}
          </div>
        ))}
        {!data.posts.length && <p className={styles.notice}>You have not posted yet.</p>}
      </section>

      <section className={styles.card} id="comments">
        <h2>Your comments</h2>
        {data.comments.map((c) => <div key={c.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--md-neutral-100)" }}><Link href={`/community/post/${c.post.slug}`}>{c.post.title}</Link><p className={styles.notice} style={{ margin: "2px 0 0" }}>{c.excerpt} · {ago(c.createdAt)}</p></div>)}
        {!data.comments.length && <p className={styles.notice}>You have not commented yet.</p>}
      </section>

      <section className={styles.card}>
        <h2>Saved (only you can see this)</h2>
        {data.saved.map((p) => <div key={p.id}><Link href={`/community/post/${p.slug}`}>{p.title}</Link></div>)}
        {!data.saved.length && <p className={styles.notice}>Nothing saved.</p>}
      </section>

      <section className={styles.card}>
        <h2>Following</h2>
        <div className={styles.filters}>{data.following.map((c) => <Link key={c.slug} className={styles.chip} href={`/community/c/${c.slug}`}>{c.name}</Link>)}{!data.following.length && <span className={styles.notice}>You are not following any community.</span>}</div>
      </section>

      <section className={styles.card}>
        <h2>Your reports</h2>
        {data.reports.map((r) => <div key={r.id} className={styles.meta}><span>{r.targetType.toLowerCase()}</span><span>{r.category.toLowerCase().replace("_", " ")}</span><span>{r.status.toLowerCase()}</span><span>{ago(r.createdAt)}</span></div>)}
        {!data.reports.length && <p className={styles.notice}>You have not reported anything.</p>}
      </section>
    </div>
  );
}
