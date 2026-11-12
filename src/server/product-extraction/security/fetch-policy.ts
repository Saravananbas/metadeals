import { ALLOWED_RETAILER_DOMAINS, findAllowedDomain } from "./domain-allowlist";
import { fetchPublicResponseBytes } from "./safe-image-fetch";

export const MAX_HTML_BYTES = 6 * 1024 * 1024; // 6 MB
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
export const DEFAULT_TIMEOUT_MS = 8000; // 8 seconds

export interface SafeFetchOptions {
  maxBytes?: number;
  timeoutMs?: number;
  allowedContentTypes?: string[];
  allowedDomains?: string[];
}

export async function safeFetchText(
  targetUrl: string,
  options: SafeFetchOptions = {}
): Promise<{ text: string; finalUrl: string; contentType: string }> {
  const maxBytes = options.maxBytes ?? MAX_HTML_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const allowedContentTypes = options.allowedContentTypes ?? [
    "text/html",
    "application/xhtml+xml",
    "application/json",
    "application/ld+json",
  ];
  let allowedDomains = options.allowedDomains;
  if (!allowedDomains) {
    let host: string;
    try {
      host = new URL(targetUrl).hostname;
    } catch {
      throw new Error("Malformed product URL.");
    }
    const retailer = findAllowedDomain(host);
    if (!retailer) throw new Error("Request host is not an approved retailer domain.");
    allowedDomains = ALLOWED_RETAILER_DOMAINS
      .filter((entry) => entry.retailerSlug === retailer.retailerSlug)
      .map((entry) => entry.domain);
  }
  const allowedContentTypePattern = allowedContentTypes.length
    ? new RegExp(`^(?:${allowedContentTypes.map((type) => type.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})$`, "i")
    : /.*/;
  // Retailers rate-limit bursts (HTTP 429/503) and often succeed moments later. Retry twice with a pause;
  // every attempt still goes through the same public-address, redirect and domain checks.
  let fetched: Awaited<ReturnType<typeof fetchPublicResponseBytes>> | undefined;
  for (let attempt = 0; ; attempt++) {
    try {
      fetched = await fetchPublicResponseBytes(targetUrl, maxBytes, {
        allowedDomains,
        contentTypePattern: allowedContentTypePattern,
        accept: "text/html,application/xhtml+xml,application/json,application/ld+json;q=0.9,*/*;q=0.5",
        timeoutMs,
        userAgent: "MetaDeals4U-ProductFetcher/0.1",
      });
      break;
    } catch (error) {
      const throttled = error instanceof Error && /returned HTTP (?:429|503)/.test(error.message);
      if (!throttled || attempt >= 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2500 * (attempt + 1)));
    }
  }
  const { bytes, contentType, finalUrl } = fetched;
  return { text: bytes.toString("utf-8"), finalUrl, contentType };
}

export function sanitizeExtractedText(input: string): string {
  if (!input) return "";
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
