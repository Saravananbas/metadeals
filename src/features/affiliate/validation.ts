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

export function validateDestinationHost(
  destinationUrl: string,
  merchantWebsiteUrl: string,
  affiliateHosts: string[] = []
): boolean {
  try {
    const dest = new URL(destinationUrl);
    if (dest.protocol !== "https:") return false;

    const destHost = dest.hostname.toLowerCase();
    const merchantHost = new URL(merchantWebsiteUrl).hostname.toLowerCase();

    const allowed = [
      merchantHost,
      ...affiliateHosts.map((h) => h.trim().toLowerCase()),
    ].filter(Boolean);

    return allowed.some(
      (allowedHost) =>
        destHost === allowedHost || destHost.endsWith("." + allowedHost)
    );
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

