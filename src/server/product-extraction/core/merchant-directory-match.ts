import type { PrismaClient } from "@/generated/prisma/client";

export type ActiveDirectoryMerchant = {
  id: string;
  name: string;
  domain: string;
  websiteUrl: string;
};

/** Resolve a URL only to an ACTIVE directory domain using label-boundary matching. */
export async function findActiveDirectoryMerchantForUrl(
  db: PrismaClient,
  rawUrl: string,
): Promise<ActiveDirectoryMerchant | null> {
  let hostname: string;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }

  const labels = hostname.split(".");
  if (labels.length < 2 || labels.some((label) => !label)) return null;
  const suffixes = labels.slice(0, -1).map((_, index) => labels.slice(index).join("."));
  const candidateDomains = [...new Set([...suffixes, ...suffixes.map((domain) => `www.${domain}`)])];
  const candidates = await db.merchantWebsiteDirectory.findMany({
    where: { status: "ACTIVE", domain: { in: candidateDomains } },
    select: { id: true, name: true, domain: true, websiteUrl: true },
  });

  return candidates
    .filter((merchant) => {
      const domain = merchant.domain.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
      return domain.split(".").length >= 2 && (hostname === domain || hostname.endsWith(`.${domain}`));
    })
    .sort((left, right) => right.domain.length - left.domain.length)[0] ?? null;
}
