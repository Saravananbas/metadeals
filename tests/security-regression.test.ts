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
  assert.match(admin, /resource === "cuelinks"[\s\S]{0,300}affiliate:view/, "cuelinks stats need affiliate:view (admins and above by role, or a chosen list)");
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

test("guest comment names cannot pose as staff", async () => {
  const { looksLikeStaffName } = await import("../src/features/community/validation");
  for (const bad of ["Admin", "MetaDeals4U Staff", "m3tadeals team", "0fficial", "Moderator_Ravi", "SUPP0RT", "A d m i n", "Аdmin", "Admln", "Administrator", "metadeals", "Admin1", "Admin!", "Admin2024", "Ádmin", "Ad​min", "Rahul (admin)"]) assert.equal(looksLikeStaffName(bad), true, bad);
  for (const ok of ["Ravi", "Priya K", "Modi fan", "Deal Hunter", "Guest", "Tad Minnow", "Stafford", "Supporter", "Ecosystem", "Systems Guy", "रवि कुमार", "ரவி"]) assert.equal(looksLikeStaffName(ok), false, ok);
});

test("click statistics: approved channels only, repeats are not recorded, redirect is never blocked by the throttle", async () => {
  const { normalizeClickChannel, shouldRecordClick } = await import("../src/server/affiliate/service");
  assert.equal(normalizeClickChannel("telegram"), "telegram");
  assert.equal(normalizeClickChannel("MOBILE"), "mobile");
  assert.equal(normalizeClickChannel("<script>"), "web");
  assert.equal(normalizeClickChannel(null), "web");
  assert.equal(normalizeClickChannel("a".repeat(500)), "web");
  const t = 1_000_000;
  assert.equal(shouldRecordClick("visitor-A", "deal-1", null, t), true);
  assert.equal(shouldRecordClick("visitor-A", "deal-1", null, t + 3000), false, "rapid repeat is not recorded");
  assert.equal(shouldRecordClick("visitor-A", "deal-1", null, t + 11_000), true, "after 10 seconds it counts again");
  assert.equal(shouldRecordClick("visitor-B", "deal-1", null, t + 3000), true, "another visitor is unaffected");
  let recorded = 0;
  for (let i = 0; i < 100; i++) if (shouldRecordClick("flooder", "deal-" + i, null, t + 20_000)) recorded++;
  assert.equal(recorded, 30, "a flood is capped per minute");
});

test("affiliate network links cannot forward to arbitrary sites", async () => {
  const { validateDestinationHost } = await import("../src/features/affiliate/validation");
  const { PERMITTED_RETAILER_HOSTS } = await import("../src/server/affiliate/service");
  const ok = (url: string) => validateDestinationHost(url, "https://www.flipkart.com", [], PERMITTED_RETAILER_HOSTS);
  assert.equal(ok("https://www.flipkart.com/phone/p/itm123"), true, "the store itself");
  assert.equal(ok("https://linksredirect.com/?cl=abc&subid=telegram"), true, "network link with no forward parameter");
  assert.equal(ok("https://linksredirect.com/?cl=abc&url=" + encodeURIComponent("https://www.flipkart.com/phone/p/itm123")), true, "forwards to an allowed store");
  assert.equal(ok("https://linksredirect.com/?url=" + encodeURIComponent("https://evil.example/phish")), false, "forwards to a stranger");
  assert.equal(ok("https://clnk.in/r?dest=" + encodeURIComponent("http://www.flipkart.com/")), false, "forwards to plain http");
  assert.equal(ok("https://clnk.in/r?u=" + encodeURIComponent("https://linksredirect.com/?url=https://evil.example")), false, "chained through another network");
  assert.equal(ok("https://cuelinks.com/x?url=not-a-url"), false, "unparseable target");
  assert.equal(ok("https://user:pass@www.flipkart.com/"), false, "credentials in the address");
  assert.equal(ok("http://www.flipkart.com/"), false);
  assert.equal(ok("https://evil-flipkart.com/"), false);
});

test("a download that trickles bytes is cut off by the overall deadline", async () => {
  const { PassThrough } = await import("node:stream");
  const { fetchPublicResponseBytes } = await import("../src/server/product-extraction/security/safe-image-fetch");
  const started = Date.now();
  const trickle = () => {
    const stream = new PassThrough() as unknown as import("node:http").IncomingMessage;
    Object.assign(stream, { statusCode: 200, headers: { "content-type": "image/png" }, setTimeout: () => stream });
    const timer = setInterval(() => (stream as unknown as import("node:stream").PassThrough).write(Buffer.from([1])), 50);
    stream.on("close", () => clearInterval(timer));
    return stream;
  };
  await assert.rejects(
    fetchPublicResponseBytes("https://images.example.com/a.png", 5_000_000, { totalTimeoutMs: 400, allowedDomains: ["example.com"] }, {
      resolvePublicHost: async () => ({ address: "93.184.216.34", family: 4 }),
      requestPublicResponse: async () => trickle(),
    }),
    /took too long|too long/,
  );
  assert.ok(Date.now() - started < 3000, "stopped promptly");
});

test("CSP enforce mode switches the header on (and report-only is the default)", async () => {
  const config = (await import("../next.config")).default;
  const pick = async () => Object.fromEntries((await config.headers!())[0].headers.map((h) => [h.key, h.value]));
  delete process.env.CSP_MODE;
  assert.ok((await pick())["Content-Security-Policy-Report-Only"], "default is report-only");
  process.env.CSP_MODE = "enforce";
  try {
    const enforced = await pick();
    assert.match(enforced["Content-Security-Policy"], /default-src 'self'; script-src/);
    assert.equal(enforced["Content-Security-Policy-Report-Only"], undefined);
    assert.ok(!/upgrade-insecure-requests/.test(enforced["Content-Security-Policy"]), "breaks plain-http local runs; HSTS covers production");
  } finally { delete process.env.CSP_MODE; }
});

test("the network-check route is staff-only and returns no secrets", () => {
  const src = readFileSync("src/app/api/admin/network-check/route.ts", "utf8");
  assert.match(src, /getCurrentAuthContext/);
  assert.ok(!/SECRET|PASSWORD|TOKEN|DATABASE_URL/.test(src.replace(/no secrets are returned/i, "")), "no secret names are read");
});

test("affiliate links: addresses hidden in any parameter or the path must also be allowed stores", async () => {
  const { validateDestinationHost } = await import("../src/features/affiliate/validation");
  const { PERMITTED_RETAILER_HOSTS } = await import("../src/server/affiliate/service");
  const ok = (url: string) => validateDestinationHost(url, "https://www.flipkart.com", [], PERMITTED_RETAILER_HOSTS);
  const evil = encodeURIComponent("https://evil.example/x");
  for (const name of ["redirect_to", "next", "goto", "dl", "URL", "Ulp", "x"]) assert.equal(ok(`https://linksredirect.com/?${name}=${evil}`), false, name);
  assert.equal(ok(`https://clnk.in/r/${evil}`), false, "path forwarding");
  assert.equal(ok("https://clnk.in/r?to=%2F%2Fevil.example%2Fx"), false, "scheme-less forwarding");
  assert.equal(ok(`https://linksredirect.com/?url=${encodeURIComponent(encodeURIComponent("https://evil.example"))}`), false, "double encoded");
  assert.equal(ok("https://linksredirect.com/?url=https://www.flipkart.com%09.evil.example/x"), false, "tab hides a second host");
  assert.equal(ok("https://linksredirect.com/?url=https://www.flipkart.com%252f@evil.example/x"), false, "double-encoded userinfo trick");
  assert.equal(ok("https://linksredirect.com/?out=https:/evil.example/x"), false, "single slash under an unknown parameter name");
  assert.equal(ok(`https://linksredirect.com/?pub_id=1&url=${encodeURIComponent("https://www.flipkart.com/p/x?pid=1")}&subid=telegram`), true, "a normal wrapped link still works");
});

test("an IPv6 visitor's /64 shares one rate-limit bucket", async () => {
  const { addressBucket } = await import("../src/server/client-ip");
  assert.equal(addressBucket("2406:b400:3a:1a46:14cb:e398:b3d5:2098"), addressBucket("2406:b400:3a:1a46:7d3c:bdbd:aad4:de10"));
  assert.notEqual(addressBucket("2406:b400:3a:1a46::1"), addressBucket("2406:b400:3a:1a47::1"));
  assert.equal(addressBucket("203.0.113.7"), "203.0.113.7");
  assert.equal(addressBucket(null), null);
});

test("hosting proxy probe: secret-guarded, never returns secrets, and rejects forged-looking addresses", async () => {
  process.env.ANALYTICS_CRON_SECRET = "x".repeat(40);
  process.env.ADMIN_ALLOWED_IPS = "203.0.113.7,2406:b400:3a:1a46::/64";
  const { GET } = await import("../src/app/api/health/network/route");
  const call = (headers: Record<string, string>, query = "") => GET(new Request("http://x/api/health/network" + query, { headers }));
  assert.equal((await call({})).status, 401, "no secret");
  assert.equal((await call({ "x-cron-secret": "y".repeat(40) })).status, 401, "wrong secret");
  const secret = { "x-cron-secret": "x".repeat(40) };
  const mine = await (await call({ ...secret, "x-forwarded-for": "6.6.6.6, 203.0.113.7", "x-forwarded-proto": "https" })).json();
  assert.equal(mine.clientIpUsed, "203.0.113.7", "the forged first entry is ignored");
  assert.equal(mine.adminRuleForThisClient, "allowed");
  assert.equal(mine.protocolSeenByProxy, "https");
  const stranger = await (await call({ ...secret, "x-forwarded-for": "198.51.100.9" }, "?as=2406:b400:3a:1a46:1:2:3:4")).json();
  assert.equal(stranger.adminRuleForThisClient, "blocked");
  assert.equal(stranger.adminRuleForHypotheticalAddress.decision, "allowed", "an address inside the /64");
  const garbage = await (await call({ ...secret, "x-forwarded-for": "not-an-ip" })).json();
  assert.equal(garbage.clientIpUsed, null);
  assert.equal(garbage.adminRuleForThisClient, "unknown-address", "missing or malformed headers never count as allowed");
  const text = JSON.stringify(mine);
  assert.ok(!text.includes("xxxxxxxx") && !text.includes("203.0.113.0/24"), "no secret and no allow-list in the answer");
  delete process.env.ADMIN_ALLOWED_IPS;
});
