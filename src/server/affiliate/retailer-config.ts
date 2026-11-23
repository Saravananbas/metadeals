import { decryptTotpSecret, encryptTotpSecret } from "@/server/auth/crypto";
import type { ConvertedLinkResult } from "./adapters/types";

/** One retailer's affiliate setting (a MerchantAffiliateConfig row). No row means Cuelinks, as before. */
export type RetailerAffiliateConfig = {
  mode: "OWN" | "CUELINKS" | "NONE";
  provider: "amazon" | "flipkart" | "ajio" | "custom";
  publicId: string | null;
  linkTemplate: string | null;
};

export const AFFILIATE_PROVIDERS = ["amazon", "flipkart", "ajio", "custom"] as const;
export const AFFILIATE_MODES = ["OWN", "CUELINKS", "NONE"] as const;

/** Why a setting cannot be used yet, or null when it is complete. Shown on the admin page and enforced on save. */
export function configProblem(c: Pick<RetailerAffiliateConfig, "mode" | "provider" | "publicId" | "linkTemplate">): string | null {
  if (c.mode !== "OWN") return null;
  if (c.provider === "amazon" || c.provider === "flipkart") {
    return c.publicId && /^[A-Za-z0-9._-]{2,120}$/.test(c.publicId) ? null : `${c.provider === "amazon" ? "Associate tag" : "Affiliate id"} is required (letters, digits, . _ -).`;
  }
  const t = c.linkTemplate ?? "";
  if (!/^https:\/\/[^\s/]+/i.test(t)) return "Link template must start with https://.";
  if (!/\{(?:url|encodedUrl)\}/.test(t)) return "Link template must contain {url} or {encodedUrl}.";
  if (/\{(?!url\}|encodedUrl\}|subid\})/.test(t)) return "Only {url}, {encodedUrl} and {subid} may be used in the template.";
  try {
    const host = new URL(t.replace(/\{[a-zA-Z]+\}/g, "x")).hostname;
    if (!host.includes(".")) return "Link template host is not valid.";
  } catch {
    return "Link template is not a valid address.";
  }
  return null;
}

/** Builds the earning link for a retailer that uses our own account. Returns null when the setting is incomplete, so the caller falls back to Cuelinks. */
export function buildOwnLink(config: RetailerAffiliateConfig, originalUrl: string, subId?: string): ConvertedLinkResult | null {
  if (config.mode !== "OWN" || configProblem(config)) return null;
  try {
    if (config.provider === "amazon") {
      const u = new URL(originalUrl);
      u.searchParams.set("tag", config.publicId as string);
      if (subId) u.searchParams.set("ascsubtag", subId);
      return { url: u.toString(), provider: "amazon", isAffiliate: true };
    }
    if (config.provider === "flipkart") {
      const u = new URL(originalUrl);
      u.searchParams.set("affid", config.publicId as string);
      if (subId) u.searchParams.set("affExtParam1", subId);
      return { url: u.toString(), provider: "flipkart", isAffiliate: true };
    }
    const out = (config.linkTemplate as string)
      .replaceAll("{encodedUrl}", encodeURIComponent(originalUrl))
      .replaceAll("{url}", encodeURIComponent(originalUrl))
      .replaceAll("{subid}", encodeURIComponent(subId ?? ""));
    // The network's host was typed by an administrator in the template, so it is trusted for this retailer only.
    return { url: new URL(out).toString(), provider: config.provider, isAffiliate: true, trusted: true };
  } catch {
    return null;
  }
}

/** Which program earns for a retailer, for the admin page and the deal editor. */
export function earningVia(config: Pick<RetailerAffiliateConfig, "mode" | "provider" | "publicId" | "linkTemplate"> | null | undefined, cuelinksOn: boolean): string {
  if (config?.mode === "NONE") return "Not monetised";
  if (config?.mode === "OWN") {
    const problem = configProblem(config);
    if (!problem) return `Own account (${config.provider})`;
    return cuelinksOn ? "Cuelinks (own account incomplete)" : "Not monetised (own account incomplete)";
  }
  return cuelinksOn ? "Cuelinks" : "Not monetised";
}

function credentialsKey(): string {
  const key = process.env.AFFILIATE_CREDENTIALS_KEY ?? "";
  if (!/^[A-Za-z0-9+/]{43}=$/.test(key)) throw new Error("AFFILIATE_CREDENTIALS_KEY is not set (a base64 32-byte key is needed to store API credentials).");
  return key;
}
export const encryptCredentials = (plain: string) => encryptTotpSecret(plain, credentialsKey());
export const decryptCredentials = (stored: string) => decryptTotpSecret(stored, credentialsKey());
