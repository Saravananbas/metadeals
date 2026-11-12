import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";

const status = (ip: string, path = "/admin/login", earlier = "") =>
  proxy(new NextRequest(`http://x${path}`, { headers: { "x-forwarded-for": `${earlier ? `${earlier}, ` : ""}${ip}` } })).status;

test("admin is limited to the allowed IPs", () => {
  process.env.ADMIN_ALLOWED_IPS = "203.0.113.7, 198.51.100.0/24";
  assert.equal(status("203.0.113.7"), 200);
  assert.equal(status("198.51.100.99"), 200);
  assert.equal(status("1.2.3.4"), 404);
  assert.equal(status("1.2.3.4", "/api/v1/admin/deals"), 404);
  assert.equal(status("1.2.3.4", "/admin/login", "203.0.113.7"), 404, "a forged first entry must not help");
  process.env.ADMIN_ALLOWED_IPS = "124.123.129.131, 2406:b400:3a:1a46::/64";
  assert.equal(status("124.123.129.131"), 200);
  assert.equal(status("2406:b400:3a:1a46:14cb:e398:b3d5:2098"), 200, "any address in the IPv6 range");
  assert.equal(status("2406:b400:3a:1a47::1"), 404);
  process.env.ADMIN_ALLOWED_IPS = "";
  assert.equal(status("1.2.3.4"), 200, "empty list means no restriction");
});
