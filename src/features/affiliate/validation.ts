import { createHmac } from "node:crypto";
import { z } from "zod";

export const transactionRowSchema = z.object({
  externalId: z.string().trim().min(1).max(120),
  dealId: z.string().trim().min(1).max(100).nullable().optional(),
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "PAID"]),
  commissionMinor: z.number().int().min(0).max(100_000_000), // Max 1,000,000 INR in paise
  currency: z.literal("INR").default("INR"),
  reportedAt: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/)),
}).strict();

export type TransactionRowInput = z.infer<typeof transactionRowSchema>;

export const importBatchSchema = z.object({
  provider: z.string().trim().min(2).max(60),
  transactions: z.array(transactionRowSchema).min(1).max(1000),
}).strict();

export type ImportBatchInput = z.infer<typeof importBatchSchema>;

// Affiliate networks that forward to the store address given in a query parameter. Their own host is allowed, but the address they forward to must be allowed too,
// otherwise a /go link on our domain could be pointed anywhere through them.
const NETWORK_REDIRECTORS = ["cuelinks.com", "clnk.in", "linksredirect.com"];
// Parameter names that carry a forwarding target. Their value must itself be an allowed https address (a bare "evil.example" would be completed by the network).
const FORWARD_NAMES = new Set(["url", "u", "dest", "destination", "redirect", "redirect_url", "redirect_to", "link", "to", "target", "r", "ulp", "murl", "next", "goto", "dl"]);
const INNER_URL = /https?:\/\/[^\s&?#"'<>]+/gi;

const hostMatches = (host: string, allowedHost: string) =>
  host === allowedHost || host.endsWith("." + allowedHost) || (allowedHost.startsWith("www.") && host === allowedHost.slice(4));

export function validateDestinationHost(
  destinationUrl: string,
  merchantWebsiteUrl: string,
  affiliateHosts: string[] = [],
  permittedHosts: string[] = []
): boolean {
  try {
    const dest = new URL(destinationUrl);
    if (dest.protocol !== "https:") return false;
    if (dest.username || dest.password) return false;

    const destHost = dest.hostname.toLowerCase();
    const merchantHost = new URL(merchantWebsiteUrl).hostname.toLowerCase();
    const apexMerchantHost = merchantHost.startsWith("www.") ? merchantHost.slice(4) : merchantHost;

    const allowed = [
      merchantHost,
      apexMerchantHost,
      ...affiliateHosts.map((h) => h.trim().toLowerCase()),
      ...permittedHosts.map((h) => h.trim().toLowerCase()),
    ].filter(Boolean);

    if (!allowed.some((allowedHost) => hostMatches(destHost, allowedHost))) return false;

    if (NETWORK_REDIRECTORS.some((network) => hostMatches(destHost, network))) {
      // The store the network forwards to: allowed list without the networks themselves (no chaining through another redirector).
      const stores = allowed.filter((h) => !NETWORK_REDIRECTORS.some((network) => hostMatches(h, network)));
      for (const [name, value] of dest.searchParams) {
        if (FORWARD_NAMES.has(name.toLowerCase()) && !/^https:\/\//i.test(value)) return false;
        if (/^(https?:(?!\/\/)|\/\/|\\)/i.test(value)) return false; // "https:/evil", "//evil", backslash forms under any name
      }
      // Every address inside the link (any parameter name, any case, or in the path) must also be an allowed store.
      // The check runs on the text as written and after one and two rounds of decoding, so double encoding cannot hide a different address.
      const raw = dest.pathname + "?" + dest.search.slice(1);
      const layers = [raw];
      for (let i = 0; i < 2; i += 1) { try { layers.push(decodeURIComponent(layers[layers.length - 1])); } catch { break; } }
      for (const text of layers) {
        if (/[\u0000-\u001f\u007f]/.test(text)) return false; // tabs and line breaks are ignored by URL parsers and can hide a second host
        const inner = text.match(INNER_URL) ?? [];
        if (/(^|[?&=/])\/\//.test(text.replace(INNER_URL, ""))) return false; // scheme-less //host forwarding
        for (const value of inner) {
          let target: URL;
          try { target = new URL(value); } catch { return false; }
          if (target.protocol !== "https:" || target.username || target.password) return false;
          const innerHost = target.hostname.toLowerCase();
          if (!stores.some((h) => hostMatches(innerHost, h))) return false;
        }
      }
    }
    return true;
  } catch {
    return false;
  }
}

export function isCrawlerOrPrefetch(
  userAgent: string | null,
  prefetchHeader: string | null
): boolean {
  if (prefetchHeader && prefetchHeader.toLowerCase().includes("prefetch")) {
    return true;
  }
  if (!userAgent) return true;
  const ua = userAgent.toLowerCase();
  const botSignatures = [
    "bot",
    "crawl",
    "spider",
    "slurp",
    "mediapartners-google",
    "curl",
    "wget",
    "python-requests",
    "go-http-client",
    "postman",
  ];
  return botSignatures.some((sig) => ua.includes(sig));
}

export function createActorHash(
  ip: string,
  userAgent: string,
  secret: string,
  date: Date = new Date()
): string {
  const dayKey = date.toISOString().slice(0, 10);
  return createHmac("sha256", `${secret}:${dayKey}`)
    .update(`${ip}:${userAgent}`)
    .digest("hex");
}

