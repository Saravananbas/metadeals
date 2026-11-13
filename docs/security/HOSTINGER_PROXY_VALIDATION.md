# Hostinger reverse proxy: validation evidence

Tested on **staging only** (`staging.metadeals4u.in`, Hostinger Business, Node.js app) on 13 Nov 2026, from the owner's PC, using the secret-guarded probe `/api/health/network` that was deployed for this purpose. No production setting was read or changed. Production (`metadeals4u.in`) is a different site on the same account; see "Not verified".

## What the app does with client addresses
1. `src/server/client-ip.ts` takes the address from the **last** `x-forwarded-for` entry (`TRUSTED_PROXY_HOPS`, default 1), validates its format, and falls back to `x-real-ip` only when there is no `x-forwarded-for`. It never uses the first entry.
2. The admin address rule (`src/server/ip-allow.ts`, used by `src/proxy.ts`) and every rate limit use that one function. IPv6 visitors share one rate-limit bucket per /64.
3. A missing or malformed address is treated as "unknown", and **an unknown address is never allowed through the admin rule**.

## Evidence from staging
| Test | Result |
|---|---|
| Plain IPv4 request | `x-forwarded-for` arrived as `124.123.129.131, 124.123.129.131,124.123.129.131` (my public address repeated by the proxy layers), `x-real-ip` = my address, `x-forwarded-proto: https`, `x-forwarded-port: 443`, `x-forwarded-host: staging.metadeals4u.in`. The app used `124.123.129.131`. |
| Visitor sends `X-Forwarded-For: 1.2.3.4` and `X-Real-IP: 5.6.7.8` | Header the app received: `1.2.3.4, 124.123.129.131, 1.2.3.4, 124.123.129.131,124.123.129.131`. **The forged value only appears before the proxy's real entries; the last entry is still my real address.** `x-real-ip` was **overwritten** with the real address (the forged 5.6.7.8 is gone). The app used `124.123.129.131`. |
| IPv6 request (`curl -6`) | `x-forwarded-for` = my IPv6 address (repeated), `x-real-ip` = same. The app used the IPv6 address; rate-limit bucket `2406:b400:003a:1a46::/64`; admin rule: allowed (it matches the configured /64). |
| IPv6 request with forged `X-Forwarded-For: 2001:db8::1` | Forged value only at the start; last entry the real IPv6 address; used = real. |
| Malformed `X-Forwarded-For: <script>alert(1)</script>, ::::, 999.9.9.9` | Garbage stays at the start; last entry real; used = real address. |
| 50 forged entries | Same: used = real address. Header size did not cause an error. |
| Admin address rule evaluated on the staging server for other addresses (`?as=`) | `203.0.113.50` blocked; `124.123.129.131` allowed; `124.123.129.200` blocked; an address inside the allowed IPv6 /64 allowed; an IPv6 address from a different /64 blocked. |
| Probe without the secret, or with a wrong secret | HTTP 401 both. |
| HTTPS detection | Proxy sets `x-forwarded-proto: https`. The app does not branch on it; cookies are `Secure` and `__Host-` because `NEXTAUTH_URL` is https and production mode is enforced at start-up. |
| Response headers on staging | `Strict-Transport-Security` present; **the host adds a second `Content-Security-Policy: upgrade-insecure-requests` header** alongside the app's own (both are enforced; harmless for an https site). |

**Conclusion (staging):** the Hostinger proxy appends the real client address at the end of `x-forwarded-for` and overwrites `x-real-ip`. Reading the last entry (`TRUSTED_PROXY_HOPS=1`) is correct and a visitor cannot choose their own address through headers. Because several proxy layers each repeat the real address, the real address is also repeated at the end; keep `TRUSTED_PROXY_HOPS=1`.

## Hostinger configuration inspected through the integration (read only)
- Remote MySQL rules for the staging database user: 3 (two IPv4 addresses and one IPv6 address). The integration returns no proxy settings, trusted-proxy list or WAF configuration.
- The staging database user has every privilege (`Alter`, `Drop`, `Create`, `Event`, `Trigger`, and so on): the least-privilege item is still open.
- The Hostinger edge blocks some requests before the app (for example a query string containing `<script>` returned HTTP 403 from the host, not from the app).

## Not verified, and what must be done
1. **A real request from a non-allowed network to `/admin/login`.** The rule was evaluated with the real staging configuration for other addresses (table above) but no outside network was used. *Manual step:* from a phone on mobile data open `https://staging.metadeals4u.in/admin/login`; expected "Page is not available" (HTTP 404). From the allowed network it must load.
2. **Production domain (`metadeals4u.in`).** It is a separate website on the same account (type WordPress today). Repeat the probe there after the Node.js app is deployed: the proxy may differ if a CDN or different plan features are enabled.
3. **CDN.** Staging shows CDN as off. If the CDN is switched on, the client-address chain changes: re-run every test above before relying on `ADMIN_ALLOWED_IPS`.
4. **Trusted proxy list.** Hostinger documents no trusted-proxy addresses. The code does not need one: it uses a position from the right, which the tests above confirm for staging today. If Hostinger changes the number of proxy layers the last entry stays the real address as long as the layer closest to the app keeps appending.
5. **Admin recovery.** `ADMIN_ALLOWED_IPS` is an environment variable: recovery is clearing or correcting it in hPanel and redeploying (the lock is not reachable from the site itself). Confirm you can reach hPanel from a network outside the allow-list.

## How to repeat the check
```
curl -4 -s -H "x-cron-secret: <ANALYTICS_CRON_SECRET>" https://staging.metadeals4u.in/api/health/network
curl -6 -s -H "x-cron-secret: <ANALYTICS_CRON_SECRET>" -H "X-Forwarded-For: 1.2.3.4" https://staging.metadeals4u.in/api/health/network
```
`clientIpUsed` must equal your own public address in both. Automated tests for the parsing rules: `tests/security-regression.test.ts` (client address, `/64` buckets, probe route) and `tests/admin-ip-proxy.test.ts`.
