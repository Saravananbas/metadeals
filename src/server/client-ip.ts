/**
 * One place that decides which address is "the client".
 * Behind Hostinger's proxy the real visitor address is appended as the LAST x-forwarded-for entry; earlier entries can be forged by the visitor.
 * TRUSTED_PROXY_HOPS (default 1) is how many proxy entries to count from the right; set it only if more than one proxy sits in front of the app.
 * No `server-only` import so src/proxy.ts and tests can use it.
 */
const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)$/;
const IPV6 = /^(?=.*:)[0-9a-f:]{2,39}$/i;

function normalise(raw: string): string {
  let value = raw.trim().replace(/^::ffff:/i, "");
  const bracketed = value.match(/^\[([0-9a-f:]+)\](?::\d+)?$/i);
  if (bracketed) value = bracketed[1];
  else if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(value)) value = value.slice(0, value.lastIndexOf(":"));
  return value.toLowerCase();
}

export function clientIpFromHeaders(headers: Pick<Headers, "get">): string | null {
  const hops = Math.max(1, Math.min(5, Number(process.env.TRUSTED_PROXY_HOPS ?? 1) || 1));
  const entries = (headers.get("x-forwarded-for") ?? "").split(",").map((v) => v.trim()).filter(Boolean);
  const candidate = (entries.length >= hops ? entries[entries.length - hops] : entries[0]) ?? headers.get("x-real-ip") ?? "";
  const cleaned = normalise(candidate);
  return cleaned && cleaned.length <= 45 && (IPV4.test(cleaned) || IPV6.test(cleaned)) ? cleaned : null;
}

/** Key for per-visitor limits: an IPv6 visitor controls a whole /64, so all addresses in it share one bucket. */
export function addressBucket(ip: string | null): string | null {
  if (!ip || !ip.includes(":")) return ip;
  const [head, tail] = ip.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right].slice(0, 8);
  return groups.slice(0, 4).map((g) => g.padStart(4, "0")).join(":") + "::/64";
}
