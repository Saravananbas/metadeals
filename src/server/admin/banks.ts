import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { getDatabase } from "@/server/db/client";
import { writeAudit } from "@/server/auth/audit";
import { actorCan } from "@/server/auth/access";
import type { AdminRole } from "@/server/auth/permissions";
import { DealError } from "@/server/deals/service";

type Actor = { id: string; role: AdminRole };

const bankSchema = z.object({
  name: z.string().trim().min(2).max(80),
  /** A logo uploaded through the media endpoint (/api/v1/media/<id>) or an https address. Empty removes it. */
  logoUrl: z.string().trim().max(2048).regex(/^(\/api\/v1\/media\/[A-Za-z0-9_-]+|\/bank-logos\/[a-z0-9-]+\.(?:webp|png|jpg|svg)|https:\/\/[^\s]+)$/, "Use an uploaded logo or an https address.").nullable().optional(),
  active: z.boolean().optional(),
}).strict();

async function assertCan(actor: Actor, permission: "deal:edit" | "merchant:manage") {
  if (!(await actorCan(actor, permission))) throw new DealError("Permission denied.", 403);
}

/** Every bank, for the deal form's bank list and the Banks admin page. */
export async function listBanks(actor: Actor) {
  await assertCan(actor, "deal:edit");
  return { items: await getDatabase().bank.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, slug: true, name: true, logoUrl: true, active: true } }) };
}

export async function createBank(actor: Actor, raw: unknown) {
  await assertCan(actor, "merchant:manage");
  const input = bankSchema.parse(raw);
  const db = getDatabase();
  const base = input.name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "bank";
  const slug = (await db.bank.findUnique({ where: { slug: base }, select: { id: true } })) ? `${base}-${randomBytes(2).toString("hex")}` : base;
  const top = await db.bank.aggregate({ _max: { sortOrder: true } });
  const bank = await db.bank.create({ data: { slug, name: input.name, logoUrl: input.logoUrl || null, active: input.active ?? true, sortOrder: (top._max.sortOrder ?? 0) + 10 }, select: { id: true } });
  await writeAudit({ actorId: actor.id, action: "bank.created", targetId: bank.id, success: true, metadata: { name: input.name } });
  return { id: bank.id };
}

export async function updateBank(actor: Actor, id: string, raw: unknown) {
  await assertCan(actor, "merchant:manage");
  const input = bankSchema.partial().parse(raw);
  const db = getDatabase();
  if (!(await db.bank.findUnique({ where: { id }, select: { id: true } }))) throw new DealError("Bank not found.", 404);
  await db.bank.update({ where: { id }, data: { ...(input.name !== undefined ? { name: input.name } : {}), ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl || null } : {}), ...(input.active !== undefined ? { active: input.active } : {}) } });
  await writeAudit({ actorId: actor.id, action: "bank.updated", targetId: id, success: true, metadata: { fields: Object.keys(input) } });
  return { ok: true };
}

/** A bank that is named in some deal's offers cannot be deleted (hide it instead), so no offer ever loses its bank. */
export async function deleteBank(actor: Actor, id: string) {
  await assertCan(actor, "merchant:manage");
  const db = getDatabase();
  const bank = await db.bank.findUnique({ where: { id }, select: { name: true, _count: { select: { offers: true, merchantOffers: true } } } });
  if (!bank) throw new DealError("Bank not found.", 404);
  if (bank._count.merchantOffers > 0) throw new DealError(`${bank.name} is used in ${bank._count.merchantOffers} store offer rule${bank._count.merchantOffers === 1 ? "" : "s"}. Hide it instead, or delete those rules first.`, 409);
  if (bank._count.offers > 0) throw new DealError(`${bank.name} is used in ${bank._count.offers} deal offer${bank._count.offers === 1 ? "" : "s"}. Hide it instead, or remove those offers first.`, 409);
  await db.bank.delete({ where: { id } });
  await writeAudit({ actorId: actor.id, action: "bank.deleted", targetId: id, success: true, metadata: { name: bank.name } });
  return { ok: true };
}
