import "server-only";
import { z } from "zod";
import { getDatabase } from "@/server/db/client";
import { writeAudit } from "@/server/auth/audit";
import { actorCan } from "@/server/auth/access";
import type { AdminRole } from "@/server/auth/permissions";
import { DealError } from "@/server/deals/service";
import { hostOf, resolveMerchantId } from "@/server/admin/affiliate-settings";
import { BANK_CARD_TYPES, needsBank } from "@/features/deals/validation";
import { PAYMENT_NAME } from "@/features/deals/bank-offers";

type Actor = { id: string; role: AdminRole };
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date.").refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), "Use a valid date.");

export const bankRuleSchema = z.object({
  /** A store id, or "dir:<id>" for a Merchant Website Directory store that has no store record yet. */
  store: z.string().min(1).max(120),
  /** Required for card offers; UPI and wallet offers apply whatever the bank. */
  bankId: z.string().min(1).max(100).nullable(),
  cardType: z.enum(BANK_CARD_TYPES),
  discountType: z.enum(["FLAT", "PERCENT"]),
  flatMinor: z.number().int().min(1).max(2_000_000_000).nullable(),
  percent: z.number().int().min(1).max(100).nullable(),
  capMinor: z.number().int().min(1).max(2_000_000_000).nullable(),
  minOrderMinor: z.number().int().min(1).max(2_000_000_000).nullable(),
  code: z.string().trim().max(40).nullable(),
  terms: z.string().trim().max(300).nullable(),
  startsOn: day,
  endsOn: day.nullable(),
  /** 0 = Sunday ... 6 = Saturday. Empty = every day between the dates. */
  weekdays: z.array(z.number().int().min(0).max(6)).max(7),
  active: z.boolean(),
}).strict().superRefine((o, ctx) => {
  if (needsBank(o.cardType) && !o.bankId) ctx.addIssue({ code: "custom", path: ["bankId"], message: "Choose a bank." });
  if (o.discountType === "FLAT" && o.flatMinor === null) ctx.addIssue({ code: "custom", path: ["flatMinor"], message: "Enter the discount amount." });
  if (o.discountType === "PERCENT" && o.percent === null) ctx.addIssue({ code: "custom", path: ["percent"], message: "Enter the discount percentage." });
  if (o.endsOn && o.endsOn < o.startsOn) ctx.addIssue({ code: "custom", path: ["endsOn"], message: "The end date cannot be before the start date." });
});

async function assertCan(actor: Actor, permission: "deal:edit" | "merchant:manage") {
  if (!(await actorCan(actor, permission))) throw new DealError("Permission denied.", 403);
}

/** Every store-wide offer, plus the stores (Merchant Website Directory and existing stores) to pick from. */
export async function listBankRules(actor: Actor) {
  await assertCan(actor, "deal:edit");
  const db = getDatabase();
  const [rules, directory, merchants] = await Promise.all([
    db.merchantBankOffer.findMany({ orderBy: [{ active: "desc" }, { createdAt: "desc" }], take: 500, include: { merchant: { select: { name: true, websiteUrl: true } }, bank: { select: { name: true, logoUrl: true } } } }),
    db.merchantWebsiteDirectory.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, take: 1000, select: { id: true, name: true, websiteUrl: true, domain: true } }),
    db.merchant.findMany({ orderBy: { name: "asc" }, take: 1000, select: { id: true, name: true, websiteUrl: true } }),
  ]);
  const byHost = new Map(merchants.map((m) => [hostOf(m.websiteUrl), m]));
  const used = new Set<string>();
  const stores = directory.map((d) => { const m = byHost.get(hostOf(d.domain || d.websiteUrl)); if (m) used.add(m.id); return { id: m ? m.id : `dir:${d.id}`, name: d.name, websiteUrl: d.websiteUrl }; });
  for (const m of merchants) if (!used.has(m.id)) stores.push({ id: m.id, name: m.name, websiteUrl: m.websiteUrl });
  stores.sort((a, b) => a.name.localeCompare(b.name));
  return {
    stores,
    items: rules.map((r) => ({
      id: r.id, merchantId: r.merchantId, storeName: r.merchant.name, storeWebsite: r.merchant.websiteUrl, bankId: r.bankId, bankName: r.bank?.name ?? PAYMENT_NAME[r.cardType] ?? "Any bank", bankLogoUrl: r.bank?.logoUrl ?? null,
      cardType: r.cardType, discountType: r.discountType, flatMinor: r.flatMinor, percent: r.percent, capMinor: r.capMinor, minOrderMinor: r.minOrderMinor, code: r.code, terms: r.terms,
      startsOn: r.startsOn, endsOn: r.endsOn, weekdays: r.weekdays ? r.weekdays.split(",").map(Number) : [], active: r.active,
    })),
  };
}

async function fields(raw: unknown) {
  const input = bankRuleSchema.parse(raw);
  const db = getDatabase();
  if (input.bankId && !(await db.bank.findFirst({ where: { id: input.bankId, active: true }, select: { id: true } }))) throw new DealError("That bank is not available.", 422);
  const { store, weekdays, ...rest } = input;
  // A UPI or wallet offer is for the payment method, so any bank picked earlier is dropped.
  return { ...rest, bankId: needsBank(input.cardType) ? input.bankId : null, merchantId: await resolveMerchantId(db, store), weekdays: [...new Set(weekdays)].sort().join(",") };
}

export async function createBankRule(actor: Actor, raw: unknown) {
  await assertCan(actor, "merchant:manage");
  const data = await fields(raw);
  const rule = await getDatabase().merchantBankOffer.create({ data, select: { id: true } });
  await writeAudit({ actorId: actor.id, action: "bank_offer_rule.created", targetId: rule.id, success: true, metadata: { merchantId: data.merchantId, bankId: data.bankId } });
  return { id: rule.id };
}

export async function updateBankRule(actor: Actor, id: string, raw: unknown) {
  await assertCan(actor, "merchant:manage");
  const db = getDatabase();
  if (!(await db.merchantBankOffer.findUnique({ where: { id }, select: { id: true } }))) throw new DealError("Offer not found.", 404);
  await db.merchantBankOffer.update({ where: { id }, data: await fields(raw) });
  await writeAudit({ actorId: actor.id, action: "bank_offer_rule.updated", targetId: id, success: true });
  return { ok: true };
}

export async function deleteBankRule(actor: Actor, id: string) {
  await assertCan(actor, "merchant:manage");
  const db = getDatabase();
  if (!(await db.merchantBankOffer.findUnique({ where: { id }, select: { id: true } }))) throw new DealError("Offer not found.", 404);
  await db.merchantBankOffer.delete({ where: { id } });
  await writeAudit({ actorId: actor.id, action: "bank_offer_rule.deleted", targetId: id, success: true });
  return { ok: true };
}
