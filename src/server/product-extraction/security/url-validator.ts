import { isAllowedRetailerDomain, findAllowedDomain } from "./domain-allowlist";

export interface ValidatedUrlResult {
  valid: boolean;
  url?: URL;
  hostname?: string;
  retailerName?: string;
  retailerSlug?: string;
  error?: string;
}

export interface KnownDirectoryMerchant {
  name: string;
  domain: string;
}

const PRIVATE_IP_PATTERNS = [
  /^127\./,                         // 127.0.0.0/8 (Loopback)
  /^10\./,                          // 10.0.0.0/8 (Private)
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12 (Private)
  /^192\.168\./,                    // 192.168.0.0/16 (Private)
  /^169\.254\./,                    // 169.254.0.0/16 (Link-local)
  /^0\./,                           // 0.0.0.0/8
  /^::1$/,                          // IPv6 Loopback
  /^fc00:/i,                        // IPv6 Unique Local
  /^fe80:/i,                        // IPv6 Link-local
];

export function isPrivateOrLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase().trim();
  if (host === "localhost" || host.endsWith(".localhost") || host === "127.0.0.1") return true;
  return PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(host));
}

export function isTestFixtureLoopbackHost(hostname: string): boolean {
  if (process.env.NODE_ENV !== "test") return false;
  const host = hostname.toLowerCase().trim();
  return host === "localhost" || host.endsWith(".localhost") || host === "127.0.0.1";
}

export function validateProductUrl(input: string, knownDirectoryMerchant?: KnownDirectoryMerchant | null): ValidatedUrlResult {
  if (!input || typeof input !== "string") {
    return { valid: false, error: "Product URL is required." };
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return { valid: false, error: "Product URL cannot be empty." };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, error: "Malformed URL format." };
  }

  // Enforce HTTPS
  const isTest = process.env.NODE_ENV === "test";
  if (parsed.protocol !== "https:" && !(isTest && parsed.protocol === "http:")) {
    return { valid: false, error: "Only secure HTTPS URLs are permitted." };
  }

  // Reject credentials in URL
  if (parsed.username || parsed.password) {
    return { valid: false, error: "URLs containing credentials or userinfo are prohibited." };
  }

  // Reject custom ports in production
  if (parsed.port && !(isTest && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1"))) {
    return { valid: false, error: "Custom network ports are prohibited." };
  }

  const host = parsed.hostname.toLowerCase();

  // SSRF check: reject private and loopback IPs
  if (isPrivateOrLoopbackHost(host) && !isTestFixtureLoopbackHost(host)) {
    return { valid: false, error: "Access to private or local network hosts is prohibited (SSRF prevention)." };
  }

  // Reject raw IP literals in production
  if (!isTest && /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return { valid: false, error: "Raw IP addresses are not permitted. Use a valid domain name." };
  }

  // Check retailer allowlist
  const domainInfo = findAllowedDomain(host);
  const merchantDomain = knownDirectoryMerchant?.domain.toLowerCase().trim().replace(/^www\./, "").replace(/\.$/, "");
  const knownMerchantMatchesHost = Boolean(
    merchantDomain && merchantDomain.split(".").length >= 2 &&
      (host === merchantDomain || host.endsWith(`.${merchantDomain}`)),
  );
  if (!domainInfo && !isAllowedRetailerDomain(host) && !knownMerchantMatchesHost) {
    return {
      valid: false,
      error: `Retailer domain "${host}" is not supported. Supported retailers include Amazon India, Flipkart, Myntra, Croma, and other partner stores.`,
    };
  }

  return {
    valid: true,
    url: parsed,
    hostname: host,
    retailerName: domainInfo?.retailerName ?? (knownMerchantMatchesHost ? knownDirectoryMerchant!.name : "Generic Retailer"),
    retailerSlug: domainInfo?.retailerSlug ?? (knownMerchantMatchesHost
      ? knownDirectoryMerchant!.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
      : "generic"),
  };
}

export function cleanProductUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    // Strip common tracking and affiliate parameters for clean canonical reference
    const trackingParams = [
      "tag", "ascsubtag", "linkCode", "creative", "camp", "creativeASIN",
      "affid", "affExtParam1", "affExtParam2",
      "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
      "gclid", "fbclid", "msclkid", "ref", "ref_", "sr", "qid"
    ];
    for (const param of trackingParams) {
      url.searchParams.delete(param);
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}
