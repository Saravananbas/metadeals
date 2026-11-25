import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { getDatabase } from "@/server/db/client";
import { writeAudit } from "@/server/auth/audit";
import { actorCan } from "@/server/auth/access";
import type { AdminRole } from "@/server/auth/permissions";
import { DealError } from "@/server/deals/service";
import { convertMerchantUrl } from "@/server/affiliate/adapters/registry";
import { AFFILIATE_MODES, AFFILIATE_PROVIDERS, configProblem, earningVia, encryptCredentials } from "@/server/affiliate/retailer-config";

type Actor = { id: string; role: AdminRole };

async function assertCan(actor: Actor, permission: "affiliate:view" | "affiliate:manage") {
  if (!(await actorCan(actor, permission))) throw new DealError("Permission denied.", 403);
}

const cuelinksOn = () => process.env.CUELINKS_ENABLED !== "false" && process.env.CUELINKS_REDIRECT_MODE !== "direct" && Boolean(process.env.CUELINKS_CHANNEL_ID || process.env.CUELINKS_PUB_ID);

export const retailerConfigSchema = z.object({
  mode: z.enum(AFFILIATE_MODES),
  provider: z.enum(AFFILIATE_PROVIDERS),
  publicId: z.string().trim().max(120).nullable().optional(),
  linkTemplate: z.string().trim().max(1000).nullable().optional(),
  /** Write-only. Stored encrypted and never sent back. Empty or missing keeps what is stored. */
  apiCredentials: z.string().max(2000).optional(),
  clearCredentials: z.boolean().optional(),
  apiEnabled: z.boolean().optional(),
}).strict();

type ConfigRow = { mode: string; provider: string; publicId: string | null; linkTemplate: string | null; apiEnabled: boolean; credentialsEncrypted: string | null } | null;
const asConfig = (c: ConfigRow) => (c ? { mode: c.mode as "OWN" | "CUELINKS" | "NONE", provider: c.provider as "amazon" | "flipkart" | "ajio" | "custom", publicId: c.publicId, linkTemplate: c.linkTemplate } : null);

/** Every store of the Merchant Website Directory (and any other store that already has deals), with how its links earn. Secrets are never part of the result, only whether some are saved. */
export async function listRetailers(actor: Actor) {
  await assertCan(actor, "affiliate:view");
  const db = getDatabase();
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [directory, merchants, clicks] = await Promise.all([
    db.merchantWebsiteDirectory.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, take: 1000, select: { id: true, name: true, websiteUrl: true, domain: true } }),
    db.merchant.findMany({ orderBy: { name: "asc" }, take: 1000, include: { affiliateConfig: true } }),
    db.affiliateClick.groupBy({ by: ["merchantId"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
  ]);
  const clickMap = new Map(clicks.map((c) => [c.merchantId, c._count._all]));
  const byHost = new Map(merchants.map((m) => [hostOf(m.websiteUrl), m]));
  const on = cuelinksOn();
  const used = new Set<string>();
  const row = (id: string, name: string, websiteUrl: string, m: (typeof merchants)[number] | undefined) => {
    const c = m?.affiliateConfig ?? null;
    const config = asConfig(c);
    return {
      id, name, websiteUrl, clicks30d: m ? clickMap.get(m.id) ?? 0 : 0, earningVia: earningVia(config, on),
      config: config && { ...config, apiEnabled: c?.apiEnabled ?? false, hasCredentials: Boolean(c?.credentialsEncrypted), problem: configProblem(config) },
    };
  };
  const items = directory.map((d) => {
    const m = byHost.get(hostOf(d.domain || d.websiteUrl));
    if (m) used.add(m.id);
    return row(m ? m.id : `dir:${d.id}`, d.name, d.websiteUrl, m);
  });
  for (const m of merchants) if (!used.has(m.id)) items.push(row(m.id, m.name, m.websiteUrl, m));
  items.sort((a, b) => a.name.localeCompare(b.name));
  return { cuelinksOn: on, items };
}

/** A row id is a store id, or "dir:<id>" for a directory store that has no store record yet; this makes the record (the directory website is the only host its buy links may use). */
export async function resolveMerchantId(db: ReturnType<typeof getDatabase>, ref: string): Promise<string> {
  if (!ref.startsWith("dir:")) {
    if (!(await db.merchant.findUnique({ where: { id: ref }, select: { id: true } }))) throw new DealError("Store not found.", 404);
    return ref;
  }
  const entry = await db.merchantWebsiteDirectory.findUnique({ where: { id: ref.slice(4) } });
  if (!entry || entry.status !== "ACTIVE") throw new DealError("That directory store is not available.", 404);
  const host = hostOf(entry.domain || entry.websiteUrl);
  if (!host) throw new DealError("That directory store has no website.", 409);
  const existing = (await db.merchant.findMany({ select: { id: true, websiteUrl: true } })).find((m) => hostOf(m.websiteUrl) === host);
  if (existing) return existing.id;
  const base = entry.name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90) || "store";
  const slug = (await db.merchant.findUnique({ where: { slug: base }, select: { id: true } })) ? `${base}-${randomBytes(2).toString("hex")}` : base;
  return (await db.merchant.create({ data: { slug, name: entry.name.slice(0, 100), websiteUrl: entry.websiteUrl.slice(0, 2048), affiliateHosts: [host] }, select: { id: true } })).id;
}

export async function saveRetailerConfig(actor: Actor, ref: string, raw: unknown) {
  await assertCan(actor, "affiliate:manage");
  const input = retailerConfigSchema.parse(raw);
  const publicId = input.publicId || null;
  const linkTemplate = input.linkTemplate || null;
  const problem = configProblem({ mode: input.mode, provider: input.provider, publicId, linkTemplate });
  if (problem) throw new DealError(problem, 422);
  const db = getDatabase();
  const merchantId = await resolveMerchantId(db, ref);
  let credentialsEncrypted: string | null | undefined;
  if (input.clearCredentials) credentialsEncrypted = null;
  else if (input.apiCredentials) {
    try { credentialsEncrypted = encryptCredentials(input.apiCredentials); } catch (e) { throw new DealError((e as Error).message, 409); }
  }
  const data = { mode: input.mode, provider: input.provider, publicId, linkTemplate, apiEnabled: input.apiEnabled ?? false, ...(credentialsEncrypted !== undefined ? { credentialsEncrypted } : {}) };
  await db.merchantAffiliateConfig.upsert({ where: { merchantId }, create: { merchantId, ...data }, update: data });
  // The audit record names what changed, never the secret itself.
  await writeAudit({ actorId: actor.id, action: "affiliate.retailer_config_saved", targetId: merchantId, success: true, metadata: { mode: input.mode, provider: input.provider, credentialsChanged: credentialsEncrypted !== undefined } });
  return { ok: true, id: merchantId };
}

export const hostOf = (raw: string) => { try { return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; } };

/** "Add a retailer from its website link": finds the store by website or creates it, then the page opens its affiliate setting. */
export async function addRetailerFromUrl(actor: Actor, rawUrl: unknown) {
  await assertCan(actor, "affiliate:manage");
  const text = z.string().trim().min(4).max(2048).parse(rawUrl);
  const host = hostOf(text);
  if (!host || !host.includes(".")) throw new DealError("Enter a website address such as https://www.ajio.com", 422);
  const db = getDatabase();
  const existing = (await db.merchant.findMany({ select: { id: true, websiteUrl: true } })).find((m) => hostOf(m.websiteUrl) === host);
  if (existing) return { id: existing.id, created: false };
  const entry = (await db.merchantWebsiteDirectory.findMany({ where: { status: "ACTIVE" }, select: { id: true, domain: true, websiteUrl: true }, take: 2000 })).find((d) => hostOf(d.domain || d.websiteUrl) === host);
  if (entry) return { id: `dir:${entry.id}`, created: false };
  const label = host.split(".").slice(-3, -1).join(" ").split(" ").filter((p) => p !== "co" && p !== "com").pop() ?? host;
  const name = label.charAt(0).toUpperCase() + label.slice(1);
  const base = host.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90) || "store";
  const slug = (await db.merchant.findUnique({ where: { slug: base }, select: { id: true } })) ? `${base}-${randomBytes(2).toString("hex")}` : base;
  const created = await db.merchant.create({ data: { slug, name: name.slice(0, 100), websiteUrl: `https://${host}`, affiliateHosts: [host] }, select: { id: true } });
  await writeAudit({ actorId: actor.id, action: "affiliate.retailer_added", targetId: created.id, success: true, metadata: { host } });
  return { id: created.id, created: true };
}

/** Builds a sample link with the saved setting so the owner can see exactly what a visitor would be sent to. Makes no request to any network. */
export async function testRetailer(actor: Actor, ref: string, productUrl?: unknown) {
  await assertCan(actor, "affiliate:view");
  const db = getDatabase();
  let site: string;
  let c: ConfigRow = null;
  if (ref.startsWith("dir:")) {
    const d = await db.merchantWebsiteDirectory.findUnique({ where: { id: ref.slice(4) }, select: { websiteUrl: true } });
    if (!d) throw new DealError("Store not found.", 404);
    site = d.websiteUrl;
  } else {
    const m = await db.merchant.findUnique({ where: { id: ref }, include: { affiliateConfig: true } });
    if (!m) throw new DealError("Store not found.", 404);
    site = m.websiteUrl; c = m.affiliateConfig;
  }
  const config = asConfig(c);
  // An optional real product address of this store makes the test link open that product.
  let sample = `${site.replace(/\/+$/, "")}/sample-product`;
  if (typeof productUrl === "string" && productUrl.trim()) {
    const given = z.string().trim().max(2048).url().parse(productUrl);
    if (!/^https:\/\//i.test(given) || hostOf(given) !== hostOf(site)) throw new DealError(`Enter an https product link from ${hostOf(site)}.`, 422);
    sample = given;
  }
  const result = convertMerchantUrl(sample, hostOf(site), { dealId: "test", subId: "web" }, config);
  return { via: earningVia(config, cuelinksOn()), provider: result.provider, isAffiliate: result.isAffiliate, sampleLink: result.url, problem: config ? configProblem(config) : null };
}
