import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { serializeJsonLd, safeHttpsHref } from "../src/lib/json-ld";
import { clientIpFromHeaders } from "../src/server/client-ip";
import { roleCan } from "../src/server/auth/permissions";
import { merchantInputSchema } from "../src/features/deals/validation";

const headers = (value: Record<string, string>) => new Headers(value);

test("deal text can never close the JSON-LD script tag", () => {
  const title = "</script><script>window.pwned=1</script>  ";
  const out = serializeJsonLd({ name: title });
  assert.ok(!out.includes("</script"), "no raw closing tag");
  assert.ok(!out.includes("<"), "no raw angle bracket");
  assert.equal(JSON.parse(out).name, title, "the data itself is unchanged");
});

test("links from third-party data are only clickable when https", () => {
  assert.equal(safeHttpsHref("javascript:alert(1)"), "#");
  assert.equal(safeHttpsHref("data:text/html,x"), "#");
  assert.equal(safeHttpsHref("http://example.com/"), "#");
  assert.equal(safeHttpsHref("not a url"), "#");
  assert.equal(safeHttpsHref("https://example.com/a?b=1"), "https://example.com/a?b=1");
});

test("client address comes from the trusted (last) proxy entry, not a forged first one", () => {
  delete process.env.TRUSTED_PROXY_HOPS;
  assert.equal(clientIpFromHeaders(headers({ "x-forwarded-for": "6.6.6.6, 2.2.2.2" })), "2.2.2.2");
  assert.equal(clientIpFromHeaders(headers({ "x-forwarded-for": "2.2.2.2" })), "2.2.2.2");
  assert.equal(clientIpFromHeaders(headers({ "x-forwarded-for": "9.9.9.9, 6.6.6.6, ::ffff:2.2.2.2" })), "2.2.2.2");
  assert.equal(clientIpFromHeaders(headers({ "x-forwarded-for": "evil<script>" })), null, "garbage is not an address");
  assert.equal(clientIpFromHeaders(headers({})), null);
  process.env.TRUSTED_PROXY_HOPS = "2";
  assert.equal(clientIpFromHeaders(headers({ "x-forwarded-for": "6.6.6.6, 3.3.3.3, 10.0.0.1" })), "3.3.3.3");
  delete process.env.TRUSTED_PROXY_HOPS;
});

test("editors cannot do administrator-only work", () => {
  for (const permission of ["merchant:manage", "category:manage", "affiliate:manage", "operations:read", "account:role:update"] as const) {
    assert.equal(roleCan("EDITOR", permission), false, `EDITOR must not hold ${permission}`);
  }
  assert.equal(roleCan("ADMIN", "merchant:manage"), true);
  assert.equal(roleCan("ADMIN", "category:manage"), true);
  assert.equal(roleCan("ADMIN", "account:role:update"), false, "only a super admin changes roles");
  assert.equal(roleCan("SUPER_ADMIN", "account:role:update"), true);
  assert.equal(roleCan("NOT_A_ROLE" as never, "deal:edit"), false, "unknown roles are denied");
});

test("affiliate host lists cannot contain a whole top-level domain", () => {
  const base = { slug: "shop", name: "Shop", websiteUrl: "https://www.shop.in" };
  assert.equal(merchantInputSchema.safeParse({ ...base, affiliateHosts: ["com"] }).success, false);
  assert.equal(merchantInputSchema.safeParse({ ...base, affiliateHosts: ["evil.com/path"] }).success, false);
  assert.equal(merchantInputSchema.safeParse({ ...base, affiliateHosts: ["amazon.in", "clnk.in"] }).success, true);
});

test("API failures never return internal error text", async () => {
  const { api } = await import("../src/server/http");
  const originalError = console.error;
  console.error = () => {};
  try {
    const response = await api(async () => { throw new Error("connect ECONNREFUSED db-host.internal:3306 password=hunter2"); });
    const text = await response.text();
    assert.equal(response.status, 503);
    assert.ok(!text.includes("db-host") && !text.includes("hunter2") && !text.includes("ECONNREFUSED"), "internal details must not leak");
  } finally { console.error = originalError; }
});

test("security headers are configured", async () => {
  const config = (await import("../next.config")).default;
  const rules = await config.headers!();
  const all = Object.fromEntries(rules[0].headers.map((h) => [h.key, h.value]));
  assert.equal(all["X-Content-Type-Options"], "nosniff");
  assert.equal(all["X-Frame-Options"], "DENY");
  assert.match(all["Content-Security-Policy"], /frame-ancestors 'none'/);
  assert.match(all["Content-Security-Policy-Report-Only"], /default-src 'self'/);
  assert.ok(all["Referrer-Policy"] && all["Permissions-Policy"]);
});

test("authorization guards stay in the admin routes (source check)", () => {
  const admin = readFileSync("src/app/api/v1/admin/[...path]/route.ts", "utf8");
  assert.match(admin, /resource === "merchant-websites"[\s\S]{0,400}merchant:manage/, "merchant directory writes need merchant:manage");
  assert.match(admin, /resource === "categories"[\s\S]{0,300}category:manage/, "category delete needs category:manage");
  assert.match(admin, /id === "scan"[\s\S]{0,200}operations:read/, "scraper scan needs an operations role");
  assert.match(admin, /resource === "cuelinks"[\s\S]{0,300}operations:read/, "cuelinks stats need an operations role");
  assert.match(admin, /dealVideoReview\.delete\(\{ where: \{ id: body\.reviewId, dealId: id \}/, "review changes are bound to the deal in the URL");
  const kill = readFileSync("src/app/api/v1/admin/intelligence-controls/route.ts", "utf8");
  assert.match(kill, /assertSameOrigin/, "kill switch checks the request origin");
  const view = readFileSync("src/app/api/v1/deals/[slug]/view/route.ts", "utf8");
  const share = readFileSync("src/app/api/v1/deals/[slug]/share/route.ts", "utf8");
  assert.match(view, /publicWhere/);
  assert.match(share, /publicWhere/);
  const identity = readFileSync("src/server/customer/identity.ts", "utf8");
  assert.equal((identity.match(/assertNotSuspended\(profile\)/g) ?? []).length, 3, "all three identity writes check suspension");
});

test("no secret files or key material are tracked by git", () => {
  const files = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean);
  const bad = files.filter((f) => /(^|\/)\.env($|\.(?!example$))|\.(p8|pem|key|pfx)$|(^|\/)auth-passcode|analytics-cron-secret/i.test(f));
  assert.deepEqual(bad, [], "secret-like files must not be tracked");
  const patterns = [/AKIA[0-9A-Z]{16}/, /-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/, /sk_live_[0-9a-zA-Z]{16,}/, /AIza[0-9A-Za-z_-]{35}/, /ghp_[0-9A-Za-z]{30,}/];
  const hits: string[] = [];
  for (const file of files) {
    if (/\.(png|jpg|jpeg|webp|gif|ico|xlsx|zip|woff2?|lock)$|package-lock\.json$|^src\/generated\//i.test(file)) continue;
    let text: string;
    try { text = readFileSync(file, "utf8"); } catch { continue; }
    if (patterns.some((p) => p.test(text))) hits.push(file);
  }
  assert.deepEqual(hits, [], "no key material in tracked files");
});

test("client address parsing handles ports, brackets and rejects out-of-range values", () => {
  delete process.env.TRUSTED_PROXY_HOPS;
  assert.equal(clientIpFromHeaders(headers({ "x-forwarded-for": "6.6.6.6, 2.2.2.2:5678" })), "2.2.2.2");
  assert.equal(clientIpFromHeaders(headers({ "x-forwarded-for": "[2406:b400:3a:1a46::1]:443" })), "2406:b400:3a:1a46::1");
  assert.equal(clientIpFromHeaders(headers({ "x-forwarded-for": "999.1.1.1" })), null);
  assert.equal(clientIpFromHeaders(headers({ "x-forwarded-for": "a" })), null);
});
