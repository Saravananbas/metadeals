/**
 * The admin portal (pages, login and its APIs) can be limited to a few IP addresses.
 * ADMIN_ALLOWED_IPS is a comma-separated list, for example "203.0.113.7,198.51.100.0/24".
 * Left empty, nothing is restricted (local development). Anyone else gets the same "page not available" answer as a missing page.
 */
export const allowList = () => (process.env.ADMIN_ALLOWED_IPS ?? "").split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);

/** IPv4 or IPv6 text to a number, or null if it is not an address. */
function ipToBig(ip: string): { value: bigint; bits: 32 | 128 } | null {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
    const parts = ip.split(".").map(Number);
    return parts.every((n) => n >= 0 && n <= 255) ? { value: parts.reduce((acc, n) => (acc << 8n) | BigInt(n), 0n), bits: 32 } : null;
  }
  if (!/^[0-9a-f:]+$/.test(ip) || (ip.match(/::/g) ?? []).length > 1) return null;
  const [head, tail] = ip.split("::");
  const left = head ? head.split(":") : [], right = tail ? tail.split(":") : [];
  const missing = 8 - left.length - right.length;
  if (ip.includes("::") ? missing < 1 : missing !== 0) return null;
  const groups = [...left, ...Array(ip.includes("::") ? missing : 0).fill("0"), ...right];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return { value: groups.reduce((acc, g) => (acc << 16n) | BigInt(parseInt(g, 16)), 0n), bits: 128 };
}

export function allowed(ip: string, rules: string[]) {
  const visitor = ipToBig(ip);
  return rules.some((rule) => {
    if (!rule.includes("/")) { const r = ipToBig(rule); return Boolean(visitor && r && visitor.bits === r.bits && visitor.value === r.value) || rule === ip; }
    const [base, bitsText] = rule.split("/");
    const range = ipToBig(base), prefix = Number(bitsText);
    if (!visitor || !range || visitor.bits !== range.bits || !Number.isInteger(prefix) || prefix < 0 || prefix > range.bits) return false;
    const shift = BigInt(range.bits - prefix);
    return visitor.value >> shift === range.value >> shift;
  });
}


/** Same decision the proxy makes: "no-list" when ADMIN_ALLOWED_IPS is empty, otherwise whether this address may reach the admin portal. */
export function adminAccessFor(ip: string): "no-list" | "allowed" | "blocked" {
  const rules = allowList();
  if (!rules.length) return "no-list";
  return allowed(ip, rules) ? "allowed" : "blocked";
}
