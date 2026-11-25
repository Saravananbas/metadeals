"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { BankLogo } from "@/components/deals/BankLogo";
import { offerHeadline, scheduleLabel, WEEKDAY_NAMES, type BankOfferView } from "@/features/deals/bank-offers";
import { paiseToRupeeInputString, rupeesToPaise } from "@/features/deals/currency";
import { BANK_CARD_TYPES, needsBank } from "@/features/deals/validation";
import styles from "../affiliate/retailer-links.module.css";

type Bank = { id: string; name: string; logoUrl: string | null; active: boolean };
type Store = { id: string; name: string; websiteUrl: string };
type Rule = {
  id: string; merchantId: string; storeName: string; storeWebsite: string; bankId: string | null; bankName: string; bankLogoUrl: string | null;
  cardType: string; discountType: string; flatMinor: number | null; percent: number | null; capMinor: number | null; minOrderMinor: number | null;
  code: string | null; terms: string | null; startsOn: string; endsOn: string | null; weekdays: number[]; active: boolean;
};
type Form = {
  id: string | null; store: string; bankId: string; cardType: string; discountType: "FLAT" | "PERCENT"; amount: string; percent: string; cap: string; minOrder: string;
  code: string; terms: string; startsOn: string; endsOn: string; weekdays: number[]; active: boolean;
};

const CARD_LABEL: Record<string, string> = { CREDIT: "Credit card", DEBIT: "Debit card", EMI: "EMI", UPI: "UPI", WALLET: "Wallet", ANY: "Any card" };
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const blank = (): Form => ({ id: null, store: "", bankId: "", cardType: "CREDIT", discountType: "PERCENT", amount: "", percent: "", cap: "", minOrder: "", code: "", terms: "", startsOn: today(), endsOn: "", weekdays: [], active: true });

async function call<T>(url: string, method: string, body?: unknown): Promise<T> {
  const response = await fetch(url, { method, cache: "no-store", headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message ?? "Something went wrong.");
  return data as T;
}

const asView = (r: Rule): BankOfferView => ({ id: r.id, bankId: r.bankId, bankName: r.bankName, bankLogoUrl: r.bankLogoUrl, cardType: r.cardType, discountType: r.discountType, flatMinor: r.flatMinor, percent: r.percent, capMinor: r.capMinor, minOrderMinor: r.minOrderMinor, code: r.code, terms: r.terms, validUntil: null });
const fromRule = (r: Rule): Form => ({
  id: r.id, store: r.merchantId, bankId: r.bankId ?? "", cardType: r.cardType, discountType: r.discountType as Form["discountType"], amount: r.flatMinor ? paiseToRupeeInputString(r.flatMinor) : "", percent: r.percent ? String(r.percent) : "",
  cap: r.capMinor ? paiseToRupeeInputString(r.capMinor) : "", minOrder: r.minOrderMinor ? paiseToRupeeInputString(r.minOrderMinor) : "", code: r.code ?? "", terms: r.terms ?? "", startsOn: r.startsOn, endsOn: r.endsOn ?? "", weekdays: r.weekdays, active: r.active,
});

/** Store-wide bank offers: set once for a website, shown on every deal of that store while in force (dates, and optionally chosen weekdays). */
export function BankRules({ banks, canManage }: { banks: Bank[]; canManage: boolean }) {
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => { call<{ items: Rule[]; stores: Store[] }>("/api/v1/admin/bank-rules", "GET").then((d) => { setRules(d.items); setStores(d.stores); }).catch((e: Error) => setError(e.message)); }, []);
  useEffect(() => load(), [load]);
  const usable = useMemo(() => banks.filter((b) => b.active), [banks]);

  function payload(f: Form) {
    if (!f.store) throw new Error("Choose a website.");
    if (needsBank(f.cardType) && !f.bankId) throw new Error("Choose a bank.");
    const flat = f.discountType === "FLAT" ? rupeesToPaise(f.amount || "0") : null;
    const percent = f.discountType === "PERCENT" ? Math.round(Number(f.percent)) : null;
    if (f.discountType === "FLAT" && !flat) throw new Error("Enter the discount amount.");
    if (f.discountType === "PERCENT" && !(percent && percent >= 1 && percent <= 100)) throw new Error("Enter a percentage between 1 and 100.");
    if (!f.startsOn) throw new Error("Choose the start date.");
    return {
      store: f.store, bankId: needsBank(f.cardType) ? f.bankId : null, cardType: f.cardType, discountType: f.discountType, flatMinor: flat, percent, capMinor: f.discountType === "PERCENT" && f.cap ? rupeesToPaise(f.cap) : null,
      minOrderMinor: f.minOrder ? rupeesToPaise(f.minOrder) : null, code: f.code.trim() || null, terms: f.terms.trim() || null, startsOn: f.startsOn, endsOn: f.endsOn || null, weekdays: f.weekdays, active: f.active,
    };
  }
  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key); setError(null);
    try { await fn(); load(); return true; } catch (e) { setError((e as Error).message); return false; } finally { setBusy(null); }
  }
  const submit = (event: FormEvent, another = false) => {
    event.preventDefault();
    if (!form) return;
    let body: ReturnType<typeof payload>;
    try { body = payload(form); } catch (e) { setError((e as Error).message); return; }
    void run("save", () => (form.id ? call(`/api/v1/admin/bank-rules/${form.id}`, "PUT", body) : call("/api/v1/admin/bank-rules", "POST", body))).then((ok) => { if (ok) setForm(another ? { ...blank(), store: form.store, startsOn: form.startsOn, endsOn: form.endsOn, weekdays: form.weekdays } : null); });
  };
  const remove = (r: Rule) => { if (window.confirm(`Delete the ${r.bankName} offer on ${r.storeName}? Deals stop showing it right away.`)) void run(r.id, () => call(`/api/v1/admin/bank-rules/${r.id}`, "DELETE")); };
  const set = (patch: Partial<Form>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const toggleDay = (d: number) => setForm((f) => (f ? { ...f, weekdays: f.weekdays.includes(d) ? f.weekdays.filter((x) => x !== d) : [...f.weekdays, d].sort() } : f));

  const shown = rules?.slice().sort((a, b) => a.storeName.localeCompare(b.storeName) || a.bankName.localeCompare(b.bankName)).filter((r) => !filter.trim() || `${r.storeName} ${r.bankName}`.toLowerCase().includes(filter.trim().toLowerCase()));
  const status = (r: Rule) => { const t = today(); return !r.active ? "Off" : r.startsOn > t ? "Scheduled" : r.endsOn && r.endsOn < t ? "Ended" : "Live"; };

  return (
    <>
      <div className={styles.add} style={{ alignItems: "center", justifyContent: "space-between" }}>
        <input type="search" className={styles.search} value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search by website or bank" aria-label="Search offers" maxLength={80} />
        {canManage && <button type="button" className={styles.primary} onClick={() => { setForm(blank()); setError(null); }}>+ Add offer</button>}
      </div>
      {error && !form && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr><th>Website</th><th>Bank</th><th>Offer</th><th>When</th><th>Status</th><th><span className={styles.srOnly}>Actions</span></th></tr></thead>
          <tbody>
            {shown?.map((r) => (
              <tr key={r.id}>
                <td data-label="Website"><div className={styles.name}>{r.storeName}</div><div className={styles.site}>{r.storeWebsite}</div></td>
                <td data-label="Bank"><span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><BankLogo name={r.bankName} logoUrl={r.bankLogoUrl} size={28} />{r.bankName}</span></td>
                <td data-label="Offer">{offerHeadline(asView(r))}<div className={styles.site}>{CARD_LABEL[r.cardType]}{r.minOrderMinor ? ` · min ₹${paiseToRupeeInputString(r.minOrderMinor)}` : ""}</div></td>
                <td data-label="When"><div>{r.startsOn}{r.endsOn ? ` to ${r.endsOn}` : " onwards"}</div><div className={styles.site}>{scheduleLabel(r.weekdays.join(",")) ?? "Every day"}</div></td>
                <td data-label="Status"><span className={`${styles.badge} ${status(r) === "Live" ? styles.own : status(r) === "Off" || status(r) === "Ended" ? styles.off : ""}`}>{status(r)}</span></td>
                <td className={styles.act}>
                  {canManage && (
                    <span style={{ display: "inline-flex", gap: 8, flexWrap: "nowrap", justifyContent: "flex-end" }}>
                      <button type="button" className={styles.ghost} disabled={busy === r.id} onClick={() => { setForm(fromRule(r)); setError(null); }}>Edit</button>
                      <button type="button" className={styles.ghost} disabled={busy === r.id} onClick={() => remove(r)} style={{ color: "var(--md-red-700)" }}>Delete</button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rules && shown?.length === 0 && <p className={styles.empty}>{rules.length ? "No offers match your search." : "No store offers yet. Add one and every deal of that website shows it."}</p>}
      </div>

      {form && (
        <div role="dialog" aria-modal="true" aria-label={form.id ? "Edit offer" : "Add offer"} onClick={() => setForm(null)} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(20,12,40,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
          <form onSubmit={submit} onClick={(e) => e.stopPropagation()} style={{ width: "min(560px, 100%)", maxHeight: "calc(100dvh - 24px)", overflowY: "auto", background: "var(--md-white)", borderRadius: 16, padding: 20, display: "grid", gap: 12, boxShadow: "0 20px 50px rgba(40,10,90,.35)" }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>{form.id ? "Edit store offer" : "Add store offer"}</h2>
            {!form.id && <p style={{ margin: 0, fontSize: 12, color: "var(--md-neutral-600)" }}>A website can have several bank offers. After saving one, use Save and add another bank to add the next for the same website.</p>}
            <label className={styles.field}>Website
              <select value={form.store} onChange={(e) => set({ store: e.target.value })} required>
                <option value="">Select website</option>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.websiteUrl.replace(/^https?:\/\/(www\.)?/, "")}</option>)}
              </select>
            </label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <label className={styles.field} style={{ flex: "1 1 150px" }}>Card type
                <select value={form.cardType} onChange={(e) => set({ cardType: e.target.value })}>{BANK_CARD_TYPES.map((t) => <option key={t} value={t}>{CARD_LABEL[t]}</option>)}</select>
              </label>
              {needsBank(form.cardType) && (
              <label className={styles.field} style={{ flex: "1 1 200px" }}>Bank
                <select value={form.bankId} onChange={(e) => set({ bankId: e.target.value })} required={needsBank(form.cardType)}>
                  <option value="">Select bank</option>
                  {usable.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </label>
              )}
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <label className={styles.field} style={{ flex: "1 1 150px" }}>Discount
                <select value={form.discountType} onChange={(e) => set({ discountType: e.target.value as Form["discountType"] })}><option value="PERCENT">Percentage off</option><option value="FLAT">Flat amount off</option></select>
              </label>
              {form.discountType === "PERCENT" ? (
                <>
                  <label className={styles.field} style={{ flex: "1 1 110px" }}>Percent (%)<input inputMode="numeric" value={form.percent} onChange={(e) => set({ percent: e.target.value })} placeholder="15" /></label>
                  <label className={styles.field} style={{ flex: "1 1 130px" }}>Up to (₹)<input inputMode="decimal" value={form.cap} onChange={(e) => set({ cap: e.target.value })} placeholder="1000" /></label>
                </>
              ) : (
                <label className={styles.field} style={{ flex: "1 1 150px" }}>Amount off (₹)<input inputMode="decimal" value={form.amount} onChange={(e) => set({ amount: e.target.value })} placeholder="500" /></label>
              )}
              <label className={styles.field} style={{ flex: "1 1 150px" }}>Min. order (₹)<input inputMode="decimal" value={form.minOrder} onChange={(e) => set({ minOrder: e.target.value })} placeholder="optional" /></label>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <label className={styles.field} style={{ flex: "1 1 160px" }}>From<input type="date" value={form.startsOn} onChange={(e) => set({ startsOn: e.target.value })} required /></label>
              <label className={styles.field} style={{ flex: "1 1 160px" }}>To (optional)<input type="date" value={form.endsOn} min={form.startsOn} onChange={(e) => set({ endsOn: e.target.value })} /></label>
            </div>
            <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
              <legend className={styles.field} style={{ padding: 0, marginBottom: 6 }}>Repeats on (leave all unticked for every day)</legend>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {WEEKDAY_NAMES.map((n, d) => (
                  <label key={d} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", border: "1px solid var(--md-purple-200)", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer", background: form.weekdays.includes(d) ? "var(--md-purple-50)" : "var(--md-white)" }}>
                    <input type="checkbox" checked={form.weekdays.includes(d)} onChange={() => toggleDay(d)} />{n.slice(0, 3)}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className={styles.field}>Applies to / terms (optional)
              <input value={form.terms} maxLength={300} onChange={(e) => set({ terms: e.target.value })} placeholder="e.g. International and domestic flights" />
            </label>
            <label className={styles.field}>Offer code (optional)<input value={form.code} maxLength={40} onChange={(e) => set({ code: e.target.value.toUpperCase() })} /></label>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13 }}><input type="checkbox" checked={form.active} onChange={(e) => set({ active: e.target.checked })} /> Offer is on</label>
            {error && <p className={styles.error} role="alert">{error}</p>}
            <div className={styles.actions}>
              <button type="submit" className={styles.primary} disabled={busy === "save"}>{busy === "save" ? "Saving…" : "Save"}</button>
              {!form.id && <button type="button" className={styles.ghost} disabled={busy === "save"} onClick={(e) => submit(e as unknown as FormEvent, true)}>Save and add another bank</button>}
              <button type="button" className={styles.ghost} onClick={() => setForm(null)} disabled={busy === "save"}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
