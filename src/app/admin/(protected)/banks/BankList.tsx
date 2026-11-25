"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AdminNav } from "@/components/admin/AdminNav";
import { BankLogo } from "@/components/deals/BankLogo";
import { BankRules } from "./BankRules";
import styles from "../affiliate/retailer-links.module.css";

type Bank = { id: string; slug: string; name: string; logoUrl: string | null; active: boolean };

async function call<T>(url: string, method: string, body?: unknown): Promise<T> {
  const response = await fetch(url, { method, cache: "no-store", headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message ?? "Something went wrong.");
  return data as T;
}

/** Admin: the banks that can be named in a deal's bank offers, with their logos. */
export function BankList({ canManage }: { canManage: boolean }) {
  const [banks, setBanks] = useState<Bank[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<"banks" | "offers">("banks");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newLogo, setNewLogo] = useState<File | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const load = useCallback(() => { call<{ items: Bank[] }>("/api/v1/admin/banks", "GET").then((d) => setBanks(d.items)).catch((e: Error) => setError(e.message)); }, []);
  useEffect(() => load(), [load]);

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key); setError(null);
    try { await fn(); load(); } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }
  const upload = (bank: Bank, file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) { setError("Choose an image file of at most 2 MB."); return; }
    void run(bank.id, async () => {
      const response = await fetch(`/api/v1/admin/media?alt=${encodeURIComponent(`${bank.name} logo`)}`, { method: "POST", headers: { "Content-Type": file.type }, body: file });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.data?.url) throw new Error(result.error?.message ?? "Logo upload failed.");
      await call(`/api/v1/admin/banks/${bank.id}`, "PATCH", { logoUrl: result.data.url });
    });
  };

  async function uploadLogo(name: string, file: File): Promise<string> {
    const response = await fetch(`/api/v1/admin/media?alt=${encodeURIComponent(`${name} logo`)}`, { method: "POST", headers: { "Content-Type": file.type }, body: file });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.data?.url) throw new Error(result.error?.message ?? "Logo upload failed.");
    return result.data.url as string;
  }
  const newLogoPreview = useMemo(() => (newLogo ? URL.createObjectURL(newLogo) : null), [newLogo]);
  useEffect(() => () => { if (newLogoPreview) URL.revokeObjectURL(newLogoPreview); }, [newLogoPreview]);
  const closeAdd = () => { setAdding(false); setNewName(""); setNewLogo(null); };
  const pickNewLogo = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) { setError("Choose an image file of at most 2 MB."); return; }
    setError(null); setNewLogo(file);
  };
  const submitAdd = (event: FormEvent) => {
    event.preventDefault();
    const name = newName.trim();
    void run("add", async () => { await call("/api/v1/admin/banks", "POST", { name, logoUrl: newLogo ? await uploadLogo(name, newLogo) : null }); closeAdd(); });
  };
  const saveName = () => { if (!editing || editing.name.trim().length < 2) return; const { id, name: next } = editing; void run(id, async () => { await call(`/api/v1/admin/banks/${id}`, "PATCH", { name: next.trim() }); setEditing(null); }); };
  const remove = (b: Bank) => { if (window.confirm(`Delete ${b.name}? This cannot be undone. A bank used in deal offers cannot be deleted; hide it instead.`)) void run(b.id, () => call(`/api/v1/admin/banks/${b.id}`, "DELETE")); };

  return (
    <>
      <AdminNav />
      <main className={styles.page}>
        <header className={styles.head}>
          <p className={styles.sub}><a href="/admin">Deals</a> › Banks</p>
        </header>
        {tab === "offers" && (
          <>
            <div><button type="button" className={styles.ghost} onClick={() => { setTab("banks"); setError(null); }}>← Back to banks</button></div>
            <BankRules banks={banks ?? []} canManage={canManage} />
          </>
        )}
        {tab === "banks" && (
          <>
        <div className={styles.add} style={{ alignItems: "center", flexWrap: "nowrap" }}>
          <input type="search" className={styles.search} style={{ flex: "1 1 200px", maxWidth: 360 }} value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search banks" aria-label="Search banks" maxLength={80} />
          {canManage && <button type="button" className={styles.primary} style={{ whiteSpace: "nowrap" }} onClick={() => { setAdding(true); setError(null); }}>+ Add bank</button>}
          <button type="button" className={styles.ghost} style={{ whiteSpace: "nowrap" }} onClick={() => { setTab("offers"); setError(null); }}>Configure Bank Offers</button>
        </div>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Bank</th><th>Status</th><th><span className={styles.srOnly}>Actions</span></th></tr></thead>
            <tbody>
              {banks?.filter((b) => !filter.trim() || b.name.toLowerCase().includes(filter.trim().toLowerCase())).map((b) => (
                <tr key={b.id}>
                  <td data-label="Bank"><span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}><BankLogo name={b.name} logoUrl={b.logoUrl} size={36} />{editing?.id === b.id
                    ? <input autoFocus value={editing.name} maxLength={80} aria-label="Bank name" onChange={(e) => setEditing({ id: b.id, name: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditing(null); }} style={{ minHeight: 36, padding: "0 10px", border: "1px solid var(--md-purple-200)", borderRadius: 8, font: "inherit" }} />
                    : <span className={styles.name}>{b.name}</span>}</span></td>
                  <td data-label="Status"><span className={`${styles.badge} ${b.active ? styles.own : styles.off}`}>{b.active ? "Shown" : "Hidden"}</span></td>
                  <td className={styles.act}>
                    {canManage && (
                      <span style={{ display: "inline-flex", gap: 8, flexWrap: "nowrap", justifyContent: "flex-end", alignItems: "center" }}>
                        {editing?.id === b.id ? (
                          <>
                            <button type="button" className={styles.primary} disabled={busy === b.id} onClick={saveName}>Save</button>
                            <button type="button" className={styles.ghost} onClick={() => setEditing(null)}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <label className={styles.ghost} style={{ cursor: "pointer" }}>{b.logoUrl ? "Change logo" : "Upload logo"}<input type="file" accept="image/*" hidden disabled={busy === b.id} onChange={(e) => { upload(b, e.target.files?.[0]); e.target.value = ""; }} /></label>
                            <button type="button" className={styles.ghost} disabled={busy === b.id} onClick={() => setEditing({ id: b.id, name: b.name })}>Edit</button>
                            <button type="button" className={styles.ghost} disabled={busy === b.id} onClick={() => void run(b.id, () => call(`/api/v1/admin/banks/${b.id}`, "PATCH", { active: !b.active }))}>{b.active ? "Hide" : "Show"}</button>
                            <button type="button" className={styles.ghost} disabled={busy === b.id} onClick={() => remove(b)} style={{ color: "var(--md-red-700)" }}>Delete</button>
                          </>
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {banks === null && !error && <p className={styles.empty}>Loading banks…</p>}
          {banks && banks.length === 0 && <p className={styles.empty}>No banks yet. Add one with the Add bank button.</p>}
        </div>
      {adding && (
        <div role="dialog" aria-modal="true" aria-label="Add bank" onClick={closeAdd} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(20,12,40,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
          <form onSubmit={submitAdd} onClick={(e) => e.stopPropagation()} style={{ width: "min(440px, 100%)", background: "var(--md-white)", borderRadius: 16, padding: 20, display: "grid", gap: 14, boxShadow: "0 20px 50px rgba(40,10,90,.35)" }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Add bank</h2>
            <label className={styles.field}>Bank name
              <input autoFocus required minLength={2} maxLength={80} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Federal Bank" />
            </label>
            <div className={styles.field}>Logo (optional)
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <BankLogo name={newName || "Bank"} logoUrl={newLogoPreview} size={44} />
                <label className={styles.ghost} style={{ cursor: "pointer" }}>{newLogo ? "Change logo" : "Upload logo"}<input type="file" accept="image/*" hidden onChange={(e) => { pickNewLogo(e.target.files?.[0]); e.target.value = ""; }} /></label>
                {newLogo && <small>{newLogo.name}</small>}
              </div>
            </div>
            {error && <p className={styles.error} role="alert">{error}</p>}
            <div className={styles.actions}>
              <button type="submit" className={styles.primary} disabled={busy === "add"}>{busy === "add" ? "Adding…" : "Add bank"}</button>
              <button type="button" className={styles.ghost} onClick={closeAdd} disabled={busy === "add"}>Cancel</button>
            </div>
          </form>
        </div>
      )}
          </>
        )}
      </main>
    </>
  );
}
