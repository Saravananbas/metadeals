"use client";

import Link from "next/link";
import { BankLogo } from "@/components/deals/BankLogo";
import { paiseToRupeeInputString, rupeesToPaise } from "@/features/deals/currency";
import { BANK_CARD_TYPES, needsBank, type BankOfferInput } from "@/features/deals/validation";

export type BankOption = { id: string; name: string; logoUrl: string | null; active: boolean };
/** One row of the editor; money is typed in rupees, the date as YYYY-MM-DD. */
export type BankOfferDraft = {
  bankId: string; cardType: BankOfferInput["cardType"]; discountType: BankOfferInput["discountType"];
  amount: string; percent: string; cap: string; minOrder: string; code: string; terms: string; validUntil: string;
};

export const newBankOfferDraft = (): BankOfferDraft => ({ bankId: "", cardType: "CREDIT", discountType: "FLAT", amount: "", percent: "", cap: "", minOrder: "", code: "", terms: "", validUntil: "" });

type SavedOffer = { bankId: string; cardType: string; discountType: string; flatMinor: number | null; percent: number | null; capMinor: number | null; minOrderMinor: number | null; code: string | null; terms: string | null; validUntil: string | Date | null };

export function draftsFromSaved(offers: SavedOffer[] | undefined): BankOfferDraft[] {
  return (offers ?? []).map((o) => ({
    bankId: o.bankId, cardType: o.cardType as BankOfferDraft["cardType"], discountType: o.discountType as BankOfferDraft["discountType"],
    amount: o.flatMinor ? paiseToRupeeInputString(o.flatMinor) : "", percent: o.percent ? String(o.percent) : "", cap: o.capMinor ? paiseToRupeeInputString(o.capMinor) : "",
    minOrder: o.minOrderMinor ? paiseToRupeeInputString(o.minOrderMinor) : "", code: o.code ?? "", terms: o.terms ?? "",
    validUntil: o.validUntil ? new Date(o.validUntil).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) : "",
  }));
}

/** Rows to the server's shape. A row that is not complete stops the save with a message that names it. */
export function draftsToInput(drafts: BankOfferDraft[]): BankOfferInput[] {
  return drafts.map((d, i) => {
    const label = `Bank offer ${i + 1}`;
    if (needsBank(d.cardType) && !d.bankId) throw new Error(`${label}: choose a bank.`);
    const flat = d.discountType === "FLAT" ? rupeesToPaise(d.amount || "0") : null;
    const percent = d.discountType === "PERCENT" ? Math.round(Number(d.percent)) : null;
    if (d.discountType === "FLAT" && !flat) throw new Error(`${label}: enter the discount amount.`);
    if (d.discountType === "PERCENT" && !(percent && percent >= 1 && percent <= 100)) throw new Error(`${label}: enter a percentage between 1 and 100.`);
    return {
      bankId: needsBank(d.cardType) ? d.bankId : null, cardType: d.cardType, discountType: d.discountType, flatMinor: flat, percent,
      capMinor: d.discountType === "PERCENT" && d.cap ? rupeesToPaise(d.cap) : null,
      minOrderMinor: d.minOrder ? rupeesToPaise(d.minOrder) : null,
      code: d.code.trim() || null, terms: d.terms.trim() || null,
      // The offer lasts through the end of its last day, Indian time.
      validUntil: d.validUntil ? `${d.validUntil}T23:59:59+05:30` : null,
    };
  });
}

const CARD_LABEL: Record<string, string> = { CREDIT: "Credit card", DEBIT: "Debit card", EMI: "EMI", UPI: "UPI", WALLET: "Wallet", ANY: "Any card" };

/** The deal form's Bank offers section: add any number of offers, each with a bank, discount, minimum order, code, terms and last day. */
export function BankOffersEditor({ banks, value, onChange }: { banks: BankOption[]; value: BankOfferDraft[]; onChange: (next: BankOfferDraft[]) => void }) {
  const set = (i: number, patch: Partial<BankOfferDraft>) => onChange(value.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const usable = banks.filter((b) => b.active);
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 10 }}>
      <legend style={{ fontWeight: 700, padding: 0, marginBottom: 6 }}>Bank offers (optional)</legend>
      {value.length === 0 && <p style={{ margin: 0, fontSize: 12, opacity: 0.75 }}>Add an offer such as ₹1,000 off with HDFC credit cards. Visitors see it on the deal card and the deal page.</p>}
      {value.map((d, i) => {
        const bank = needsBank(d.cardType) ? banks.find((b) => b.id === d.bankId) : undefined;
        return (
          <div key={i} style={{ display: "grid", gap: 8, padding: 12, border: "1px solid var(--md-purple-100)", borderRadius: 12, background: "var(--md-purple-50)" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {bank && <BankLogo name={bank.name} logoUrl={bank.logoUrl} size={28} />}
              <select aria-label="Card type" value={d.cardType} onChange={(e) => set(i, { cardType: e.target.value as BankOfferDraft["cardType"] })} style={{ flex: "1 1 130px" }}>
                {BANK_CARD_TYPES.map((t) => <option key={t} value={t}>{CARD_LABEL[t]}</option>)}
              </select>
              {needsBank(d.cardType) && <select aria-label={`Bank for offer ${i + 1}`} value={d.bankId} onChange={(e) => set(i, { bankId: e.target.value })} style={{ flex: "1 1 200px" }}>
                <option value="">Select bank</option>
                {usable.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>}
              <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label={`Remove bank offer ${i + 1}`}>Remove</button>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <select aria-label="Discount type" value={d.discountType} onChange={(e) => set(i, { discountType: e.target.value as BankOfferDraft["discountType"] })} style={{ flex: "1 1 130px" }}>
                <option value="FLAT">Flat amount off</option>
                <option value="PERCENT">Percentage off</option>
              </select>
              {d.discountType === "FLAT"
                ? <input inputMode="decimal" aria-label="Discount amount in rupees" placeholder="Amount off (₹)" value={d.amount} onChange={(e) => set(i, { amount: e.target.value })} style={{ flex: "1 1 130px" }} />
                : <>
                    <input inputMode="numeric" aria-label="Discount percent" placeholder="Percent off (%)" value={d.percent} onChange={(e) => set(i, { percent: e.target.value })} style={{ flex: "1 1 130px" }} />
                    <input inputMode="decimal" aria-label="Maximum discount in rupees" placeholder="Up to (₹, optional)" value={d.cap} onChange={(e) => set(i, { cap: e.target.value })} style={{ flex: "1 1 150px" }} />
                  </>}
              <input inputMode="decimal" aria-label="Minimum order in rupees" placeholder="Min. order (₹, optional)" value={d.minOrder} onChange={(e) => set(i, { minOrder: e.target.value })} style={{ flex: "1 1 170px" }} />
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input aria-label="Offer code" placeholder="Code (optional)" maxLength={40} value={d.code} onChange={(e) => set(i, { code: e.target.value.toUpperCase() })} style={{ flex: "1 1 130px" }} />
              <input type="date" aria-label="Valid until" value={d.validUntil} onChange={(e) => set(i, { validUntil: e.target.value })} style={{ flex: "1 1 150px" }} />
              <input aria-label="Terms" placeholder="Terms, e.g. on EMI transactions only" maxLength={300} value={d.terms} onChange={(e) => set(i, { terms: e.target.value })} style={{ flex: "2 1 260px" }} />
            </div>
          </div>
        );
      })}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" disabled={value.length >= 10} onClick={() => onChange([...value, newBankOfferDraft()])}>+ Add bank offer</button>
        <Link href="/admin/banks" target="_blank" style={{ fontSize: 12 }}>Manage banks and logos</Link>
      </div>
    </fieldset>
  );
}
