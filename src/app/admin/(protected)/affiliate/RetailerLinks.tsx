"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AdminNav } from "@/components/admin/AdminNav";
import styles from "./retailer-links.module.css";

type Config = { mode: "OWN" | "CUELINKS" | "NONE"; provider: "amazon" | "flipkart" | "ajio" | "custom"; publicId: string | null; linkTemplate: string | null; apiEnabled: boolean; hasCredentials: boolean; problem: string | null };
type Retailer = { id: string; name: string; websiteUrl: string; clicks30d: number; earningVia: string; config: Config | null };
type Listing = { cuelinksOn: boolean; items: Retailer[] };

async function call<T>(url: string, method: string, body?: unknown): Promise<T> {
  const response = await fetch(url, { method, cache: "no-store", headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message ?? "Something went wrong.");
  return data as T;
}

/** Admin: which affiliate account earns for each store (our own account or Cuelinks), with a test that shows the exact link a visitor would get. */
export function RetailerLinks({ canManage }: { canManage: boolean }) {
  const [data, setData] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => { call<Listing>("/api/v1/admin/affiliate/retailers", "GET").then(setData).catch((e: Error) => setError(e.message)); }, []);
  useEffect(() => load(), [load]);

  async function addStore(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try { const r = await call<{ id: string }>("/api/v1/admin/affiliate/retailers", "POST", { url }); setUrl(""); load(); setOpen(r.id); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <>
      <AdminNav />
      <main className={styles.page}>
        <header className={styles.head}>
          <h1>Retailer links</h1>
          <p className={styles.sub}>Choose how each store earns: your own affiliate account, or Cuelinks. A store with no setting uses Cuelinks.</p>
        </header>
        {canManage && (
          <form className={styles.add} onSubmit={addStore}>
            <input type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Add a store: paste its website or a product link" aria-label="Store website" maxLength={2048} />
            <button type="submit" className={styles.primary} disabled={busy}>Add store</button>
          </form>
        )}
        {error && <p className={styles.error} role="alert">{error}</p>}
        {data && !data.cuelinksOn && <p className={styles.error}>Cuelinks is switched off or has no channel id, so stores without their own account are not monetised.</p>}
        <div className={styles.list}>
          {data?.items.map((r) => (
            <section key={r.id} className={styles.card}>
              <div className={styles.row}>
                <div><div className={styles.name}>{r.name}</div><div className={styles.site}>{r.websiteUrl}</div></div>
                <span className={`${styles.badge} ${r.config?.mode === "OWN" && !r.config.problem ? styles.own : r.earningVia.startsWith("Not") ? styles.off : ""}`}>{r.earningVia}</span>
                <span className={styles.meta}>{r.clicks30d} clicks (30 days)</span>
                <button type="button" className={styles.ghost} aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? "Close" : canManage ? "Set up" : "Details"}</button>
              </div>
              {open === r.id && <RetailerForm retailer={r} canManage={canManage} onSaved={load} />}
            </section>
          ))}
          {data && data.items.length === 0 && <p className={styles.sub}>No stores yet. Add one above.</p>}
        </div>
      </main>
    </>
  );
}

function RetailerForm({ retailer, canManage, onSaved }: { retailer: Retailer; canManage: boolean; onSaved: () => void }) {
  const c = retailer.config;
  const [mode, setMode] = useState<Config["mode"]>(c?.mode ?? "CUELINKS");
  const [provider, setProvider] = useState<Config["provider"]>(c?.provider ?? "custom");
  const [publicId, setPublicId] = useState(c?.publicId ?? "");
  const [template, setTemplate] = useState(c?.linkTemplate ?? "");
  const [credentials, setCredentials] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function run<T>(fn: () => Promise<T>, done: (r: T) => string) {
    setBusy(true); setMessage(null);
    try { const r = await fn(); setMessage({ ok: true, text: done(r) }); } catch (e) { setMessage({ ok: false, text: (e as Error).message }); } finally { setBusy(false); }
  }
  const save = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await call(`/api/v1/admin/affiliate/retailers/${retailer.id}`, "PUT", { mode, provider, publicId: publicId || null, linkTemplate: template || null, ...(credentials ? { apiCredentials: credentials } : {}) });
      setCredentials(""); onSaved();
    }, () => "Saved.");
  };
  const test = () => void run(() => call<{ via: string; sampleLink: string; problem: string | null }>(`/api/v1/admin/affiliate/retailers/${retailer.id}/test`, "POST", {}), (r) => `${r.via}${r.problem ? ` (${r.problem})` : ""}: ${r.sampleLink}`);

  const needsId = mode === "OWN" && (provider === "amazon" || provider === "flipkart");
  const needsTemplate = mode === "OWN" && (provider === "ajio" || provider === "custom");
  return (
    <form className={styles.form} onSubmit={save}>
      <label className={styles.field}>Earn through
        <select value={mode} disabled={!canManage} onChange={(e) => setMode(e.target.value as Config["mode"])}>
          <option value="CUELINKS">Cuelinks</option><option value="OWN">My own affiliate account</option><option value="NONE">Not monetised</option>
        </select>
      </label>
      {mode === "OWN" && (
        <label className={styles.field}>Program
          <select value={provider} disabled={!canManage} onChange={(e) => setProvider(e.target.value as Config["provider"])}>
            <option value="amazon">Amazon Associates</option><option value="flipkart">Flipkart Affiliate</option><option value="ajio">AJIO</option><option value="custom">Other network (link template)</option>
          </select>
        </label>
      )}
      {needsId && <label className={styles.field}>{provider === "amazon" ? "Associate tag" : "Affiliate id"}<input value={publicId} disabled={!canManage} onChange={(e) => setPublicId(e.target.value)} maxLength={120} /></label>}
      {needsTemplate && (
        <label className={styles.field}>Link template
          <input value={template} disabled={!canManage} onChange={(e) => setTemplate(e.target.value)} maxLength={1000} placeholder="https://network.example/click?id=YOURID&url={encodedUrl}&sub={subid}" />
          <small>Use {"{encodedUrl}"} for the product link and {"{subid}"} for the channel. Only https addresses are accepted.</small>
        </label>
      )}
      {mode === "OWN" && canManage && (
        <label className={styles.field}>API key or credentials (optional, stored encrypted, never shown again)
          <input type="password" autoComplete="off" value={credentials} onChange={(e) => setCredentials(e.target.value)} placeholder={c?.hasCredentials ? "Saved. Type to replace." : "Not saved"} maxLength={2000} />
        </label>
      )}
      {c?.problem && <p className={styles.error}>{c.problem}</p>}
      {message && <p className={message.ok ? styles.okMsg : styles.error} role="status">{message.text}</p>}
      <div className={styles.actions}>
        {canManage && <button type="submit" className={styles.primary} disabled={busy}>Save</button>}
        <button type="button" className={styles.ghost} disabled={busy} onClick={test}>Test link</button>
      </div>
    </form>
  );
}
