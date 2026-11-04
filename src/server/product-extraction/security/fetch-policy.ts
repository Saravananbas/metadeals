import { isPrivateOrLoopbackHost } from "./url-validator";
import { isAllowedRetailerDomain } from "./domain-allowlist";

export const MAX_HTML_BYTES = 2 * 1024 * 1024; // 2 MB
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
export const DEFAULT_TIMEOUT_MS = 5000; // 5 seconds

export interface SafeFetchOptions {
  maxBytes?: number;
  timeoutMs?: number;
  allowedContentTypes?: string[];
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

  let currentUrl = targetUrl;
  let redirectsRemaining = 3;

  while (redirectsRemaining >= 0) {
    const parsed = new URL(currentUrl);

    // Validate SSRF and scheme on every hop
    if (parsed.protocol !== "https:" && !(process.env.NODE_ENV === "test" && parsed.protocol === "http:")) {
      throw new Error(`Insecure redirect scheme: ${parsed.protocol}`);
    }
    if (isPrivateOrLoopbackHost(parsed.hostname)) {
      throw new Error("SSRF protection: redirect to private host blocked.");
    }
    if (!isAllowedRetailerDomain(parsed.hostname)) {
      throw new Error(`Redirect to unapproved domain blocked: ${parsed.hostname}`);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(currentUrl, {
        method: "GET",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
          "Accept-Language": "en-IN,en;q=0.9",
        },
        redirect: "manual", // Handle redirects manually for strict SSRF validation
      });

      // Handle redirect
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) {
          throw new Error("Redirect response missing location header.");
        }
        currentUrl = new URL(location, currentUrl).toString();
        redirectsRemaining--;
        continue;
      }

      if (!response.ok) {
        throw new Error(`Upstream request returned status ${response.status}`);
      }

      const contentTypeHeader = response.headers.get("content-type") || "";
      const mimeType = contentTypeHeader.split(";")[0].trim().toLowerCase();

      if (allowedContentTypes.length > 0 && !allowedContentTypes.some((t) => mimeType.includes(t))) {
        throw new Error(`Unsupported content type: ${mimeType}`);
      }

      // Read bounded stream to prevent memory exhaustion
      if (!response.body) {
        return { text: "", finalUrl: currentUrl, contentType: mimeType };
      }

      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.length;
        if (totalBytes > maxBytes) {
          await reader.cancel();
          throw new Error(`Response body exceeded maximum allowed size of ${maxBytes} bytes.`);
        }
        chunks.push(value);
      }

      const buffer = Buffer.concat(chunks);
      const text = buffer.toString("utf-8");
      return { text, finalUrl: currentUrl, contentType: mimeType };
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("Too many redirects.");
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
