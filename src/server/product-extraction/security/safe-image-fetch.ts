import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import * as https from "node:https";
import type { IncomingMessage } from "node:http";

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 6000;
const IMAGE_CONTENT_TYPE = /^image\/(?:jpeg|png|webp|avif|gif)$/i;

export type PublicAddress = { address: string; family: 4 | 6 };

function isPublicAddress(address: string, family: number): boolean {
  if (family === 4) {
    const parts = address.split(".").map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
    const [a, b, c] = parts;
    return !(
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || (b === 0 && c === 0) || (b === 0 && c === 2))) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }

  if (family !== 6) return false;
  const normalized = address.toLowerCase().split("%")[0];
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice(7);
    if (isIP(mapped) === 4) return isPublicAddress(mapped, 4);
    const groups = mapped.split(":");
    if (groups.length === 2) {
      const high = Number.parseInt(groups[0], 16);
      const low = Number.parseInt(groups[1], 16);
      if (Number.isFinite(high) && Number.isFinite(low)) {
        return isPublicAddress(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`, 4);
      }
    }
    return false;
  }
  if (normalized === "::" || normalized === "::1" || /^(?:fc|fd|fe[89ab]|ff)/i.test(normalized)) return false;
  const firstGroup = Number.parseInt(normalized.split(":")[0] || "0", 16);
  return firstGroup >= 0x2000 && firstGroup <= 0x3fff && !normalized.startsWith("2001:db8:");
}

async function resolvePublicHost(hostname: string): Promise<PublicAddress> {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const family = isIP(host);
  if (family) {
    if (!isPublicAddress(host, family)) throw new Error("Image host resolves to a non-public address.");
    return { address: host, family: family as 4 | 6 };
  }
  const addresses = await lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address, family: resolvedFamily }) => !isPublicAddress(address, resolvedFamily))) {
    throw new Error("Image host resolves to a non-public address.");
  }
  const selected = addresses[0];
  return { address: selected.address, family: selected.family as 4 | 6 };
}

async function requestPublicResponse(url: URL, pinnedAddress: PublicAddress, accept: string, timeoutMs: number, userAgent: string): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const pinnedLookup = ((
      _hostname: string,
      options: { all?: boolean },
      callback: (...args: unknown[]) => void,
    ) => {
      if (options?.all) callback(null, [pinnedAddress]);
      else callback(null, pinnedAddress.address, pinnedAddress.family);
    }) as typeof lookup;
    const request = https.request({
      protocol: url.protocol,
      hostname: host,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method: "GET",
      headers: {
        "User-Agent": userAgent,
        Accept: accept,
      },
      ...(url.protocol === "https:" && !isIP(host) ? { servername: host } : {}),
      lookup: pinnedLookup,
      agent: false,
    }, resolve);
    request.setTimeout(timeoutMs, () => request.destroy(new Error("Upstream request timed out.")));
    request.once("error", reject);
    request.end();
  });
}

export interface PublicFetchOptions {
  allowedDomains?: string[];
  contentTypePattern?: RegExp;
  accept?: string;
  timeoutMs?: number;
  userAgent?: string;
}

/** Internal seam for deterministic transport-security tests; never populated from request data. */
export interface PublicFetchTestDependencies {
  resolvePublicHost?: (hostname: string) => Promise<PublicAddress>;
  requestPublicResponse?: (url: URL, address: PublicAddress, accept: string, timeoutMs: number, userAgent: string) => Promise<IncomingMessage>;
}

export function matchesAllowedDomain(hostname: string, domains: string[]) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return domains.some((domain) => {
    const normalized = domain.toLowerCase().replace(/^\*\./, "").replace(/\.$/, "");
    return host === normalized || host.endsWith(`.${normalized}`);
  });
}

/** URL-level checks run for the initial request and every redirect hop. */
export function validatePublicFetchTarget(target: string | URL, allowedDomains?: string[]): URL {
  const url = target instanceof URL ? new URL(target.href) : new URL(target);
  if (url.protocol !== "https:") throw new Error("Only public HTTPS requests are allowed.");
  if (url.username || url.password) throw new Error("Request URLs cannot include credentials.");
  if (url.port) throw new Error("Request URLs cannot include a custom port.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (allowedDomains?.length && !matchesAllowedDomain(host, allowedDomains)) {
    throw new Error("Request host is outside the approved merchant domains.");
  }
  return url;
}

export function resolvePublicFetchRedirect(currentUrl: URL, location: string, allowedDomains?: string[]): URL {
  let nextUrl: URL;
  try {
    nextUrl = new URL(location, currentUrl);
  } catch {
    throw new Error("Redirect location is invalid.");
  }
  return validatePublicFetchTarget(nextUrl, allowedDomains);
}

export async function fetchPublicResponseBytes(
  target: string,
  maxBytes: number,
  options: PublicFetchOptions = {},
  testDependencies?: PublicFetchTestDependencies,
) {
  const resolveHost = testDependencies?.resolvePublicHost ?? resolvePublicHost;
  const requestResponse = testDependencies?.requestPublicResponse ?? requestPublicResponse;
  const allowedDomains = options.allowedDomains;
  let currentUrl = validatePublicFetchTarget(target, allowedDomains);
  const contentTypePattern = options.contentTypePattern ?? IMAGE_CONTENT_TYPE;
  const accept = options.accept ?? "image/avif,image/webp,image/png,image/jpeg,image/gif";
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  const userAgent = options.userAgent ?? "MetaDeals4U-ImageFetcher/1.0";

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const host = currentUrl.hostname.replace(/^\[|\]$/g, "");
    const pinnedAddress = await resolveHost(host);
    const response = await requestResponse(currentUrl, pinnedAddress, accept, timeoutMs, userAgent);
    response.setTimeout(timeoutMs, () => response.destroy(new Error("Upstream response timed out.")));

    if ([301, 302, 303, 307, 308].includes(response.statusCode || 0)) {
      const location = response.headers.location;
      response.resume();
      if (!location || redirect === MAX_REDIRECTS) throw new Error("Image redirect limit exceeded.");
      currentUrl = resolvePublicFetchRedirect(currentUrl, location, allowedDomains);
      continue;
    }

    if (response.statusCode !== 200) {
      response.resume();
      throw new Error(`Upstream request returned HTTP ${response.statusCode || "unknown"}.`);
    }
    const contentType = String(response.headers["content-type"] || "").split(";")[0].trim();
    if (!contentTypePattern.test(contentType)) {
      response.resume();
      throw new Error("Upstream request returned an unsupported content type.");
    }

    const chunks: Buffer[] = [];
    let totalBytes = 0;
    for await (const chunk of response) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += bytes.length;
      if (totalBytes > maxBytes) {
        response.destroy();
        throw new Error("Image exceeds the maximum allowed size.");
      }
      chunks.push(bytes);
    }
    if (!totalBytes) throw new Error("Image source returned an empty response.");
    return { bytes: Buffer.concat(chunks), contentType, finalUrl: currentUrl.href };
  }

  throw new Error("Image redirect limit exceeded.");
}

export async function fetchPublicImageBytes(target: string, maxBytes: number) {
  const { bytes, contentType } = await fetchPublicResponseBytes(target, maxBytes);
  return { bytes, contentType };
}
