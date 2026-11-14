import assert from "node:assert/strict";
import test, { mock } from "node:test";

// Real staff sessions against the real route handlers, on a DISPOSABLE migrated MariaDB (name contains "test"):
//   ROLES_TEST_DB=1 TESTDB=metadeals_modtest  (see .local/route-test.sh) node --conditions=react-server --experimental-test-module-mocks --import tsx --test tests/moderator-routes.test.ts
// Only next/headers is replaced (it needs a running Next request); the cookie it returns is a real session token stored in AuthSession.
const databaseUrl = process.env.DATABASE_URL ?? "";
const safe = /\/[^/?]*test[^/?]*(\?|$)/i.test(databaseUrl);
const skip = process.env.ROLES_TEST_DB === "1" && safe && typeof (mock as { module?: unknown }).module === "function" ? false : "set ROLES_TEST_DB=1, a disposable DATABASE_URL (name contains 'test') and --experimental-test-module-mocks";
process.env.NEXTAUTH_SECRET ??= "test-nextauth-secret-0123456789abcdef0123";
process.env.NEXTAUTH_URL = "http://localhost:4123";
process.env.AUTH_SESSION_SECRET ??= "test-session-secret-0123456789abcdef0123";
process.env.AUTH_TOTP_ENCRYPTION_KEY ??= "dGVzdC10b3RwLWtleS1mb3ItYW5hbHl0aWNzLXRlc3Q=";
process.env.AUTH_BOOTSTRAP_EMAIL ??= "test@example.com";
process.env.COMMUNITY_ENABLED = "true";
delete process.env.AUTH_DISABLED_DEV;

let currentToken: string | null = null;

test("a community moderator session can use the moderator API and nothing else; revocation and expired probation end access at once", { skip }, async () => {
  mock.module("next/headers", {
    namedExports: {
      cookies: async () => ({ get: (name: string) => (currentToken && name.includes("metadeals-session") ? { value: currentToken } : undefined), set: () => {} }),
      headers: async () => new Headers(),
    },
  });
  const { getDatabase } = await import("../src/server/db/client");
  const { createOpaqueToken, hashOpaqueToken } = await import("../src/server/auth/crypto");
  const apt = await import("../src/server/community/moderators");
  const db = getDatabase();
  const secret = process.env.AUTH_SESSION_SECRET!;
  const stamp = Date.now().toString(36);
  const email = (n: string) => `zzr-${stamp}-${n}@example.com`;

  const routes = {
    adminCatchAll: await import("../src/app/api/v1/admin/[...path]/route"),
    moderation: await import("../src/app/api/v1/admin/moderation/[...path]/route"),
    moderator: await import("../src/app/api/v1/moderator/[...path]/route"),
    accounts: await import("../src/app/api/admin/accounts/route"),
    audit: await import("../src/app/api/admin/audit/route"),
    adminCommunityQueue: await import("../src/app/api/v1/admin/community/queue/route"),
    adminCommunityReports: await import("../src/app/api/v1/admin/community/reports/route"),
    adminCommunities: await import("../src/app/api/v1/admin/community/communities/route"),
    announcements: await import("../src/app/api/v1/admin/announcements/route"),
    intelligence: await import("../src/app/api/v1/admin/intelligence-controls/route"),
    network: await import("../src/app/api/admin/network-check/route"),
    analyticsCron: await import("../src/app/api/cron/analytics-rollup/route"),
  };
  type Handler = (r: Request, c?: { params: Promise<Record<string, unknown>> }) => Promise<Response>;
  const send = async (token: string | null, handler: Handler, method: string, path: string, params: Record<string, unknown> = {}, opts: { origin?: boolean } = {}) => {
    currentToken = token;
    const init: RequestInit = { method, headers: { ...(opts.origin === false ? {} : { origin: "http://localhost:4123" }), "content-type": "application/json" }, ...(method === "GET" ? {} : { body: "{}" }) };
    return (await handler(new Request(`http://localhost:4123${path}`, init), { params: Promise.resolve(params) })).status;
  };
  const session = async (userId: string) => {
    const token = createOpaqueToken(32), now = Date.now();
    await db.authSession.create({ data: { userId, tokenHash: hashOpaqueToken(token, secret), expiresAt: new Date(now + 3_600_000), absoluteExpiresAt: new Date(now + 12 * 3_600_000) } });
    return token;
  };
  const wipe = async () => {
    await db.moderatorAppointmentEvent.deleteMany({}); await db.moderatorAppointment.deleteMany({});
    await db.authSession.deleteMany({ where: { user: { email: { startsWith: "zzr-" } } } }); await db.auditEvent.deleteMany({ where: { actor: { email: { startsWith: "zzr-" } } } });
    await db.user.updateMany({ where: { email: { startsWith: "zzr-" } }, data: { linkedCustomerId: null } });
    await db.forumProfile.deleteMany({ where: { customer: { email: { startsWith: "zzr-" } } } }); await db.customer.deleteMany({ where: { email: { startsWith: "zzr-" } } }); await db.user.deleteMany({ where: { email: { startsWith: "zzr-" } } });
  };
  await wipe();
  try {
    const customer = await db.customer.create({ data: { name: "Route Mod", email: email("customer"), emailVerifiedAt: new Date() } });
    await db.forumProfile.create({ data: { customerId: customer.id, handle: `route_mod_${stamp}`.slice(0, 30) } });
    const admin = await db.user.create({ data: { email: email("admin"), role: "ADMIN", status: "ACTIVE", totpEnabledAt: new Date(), passwordHash: "x" } });
    const moderator = await db.user.create({ data: { email: email("mod"), role: "COMMUNITY_MODERATOR", status: "ACTIVE", totpEnabledAt: new Date(), passwordHash: "x", linkedCustomerId: customer.id } });
    const appointment = await db.moderatorAppointment.create({ data: { customerId: customer.id, invitedById: admin.id, staffUserId: moderator.id, status: "PROBATION", acceptedAt: new Date(), probationEndsAt: new Date(Date.now() + 20 * 86_400_000) } });
    const modToken = await session(moderator.id), adminToken = await session(admin.id);

    // ---- the moderator API works for the moderator ----
    for (const path of ["/api/v1/moderator/me", "/api/v1/moderator/queue", "/api/v1/moderator/reports", "/api/v1/moderator/submissions", "/api/v1/moderator/history", "/api/v1/moderator/catalog"])
      assert.equal(await send(modToken, routes.moderator.GET as Handler, "GET", path, { path: [path.split("/").pop()!] }), 200, path);
    assert.equal(await send(null, routes.moderator.GET as Handler, "GET", "/api/v1/moderator/queue", { path: ["queue"] }), 401, "no session");
    assert.equal(await send(modToken, routes.moderator.POST as Handler, "POST", "/api/v1/moderator/sensitive", { path: ["sensitive"] }, { origin: false }), 403, "writes need a same-site origin");
    assert.equal(await send(adminToken, routes.moderator.GET as Handler, "GET", "/api/v1/moderator/queue", { path: ["queue"] }), 403, "the moderator API is for moderators only");

    // ---- everything else is closed to the moderator ----
    const closed: Array<[string, Handler, string, string, Record<string, unknown>]> = [
      ["admin deals", routes.adminCatchAll.GET as Handler, "GET", "/api/v1/admin/deals", { path: ["deals"] }],
      ["admin categories", routes.adminCatchAll.GET as Handler, "GET", "/api/v1/admin/categories", { path: ["categories"] }],
      ["admin merchants", routes.adminCatchAll.GET as Handler, "GET", "/api/v1/admin/merchants", { path: ["merchants"] }],
      ["admin analytics", routes.adminCatchAll.GET as Handler, "GET", "/api/v1/admin/analytics", { path: ["analytics"] }],
      ["admin affiliate", routes.adminCatchAll.GET as Handler, "GET", "/api/v1/admin/affiliate", { path: ["affiliate"] }],
      ["admin scraper", routes.adminCatchAll.GET as Handler, "GET", "/api/v1/admin/scraper", { path: ["scraper"] }],
      ["admin distribution", routes.adminCatchAll.GET as Handler, "GET", "/api/v1/admin/distribution/history", { path: ["distribution", "history"] }],
      ["admin submissions list (deal review route)", routes.adminCatchAll.GET as Handler, "GET", "/api/v1/admin/submissions", { path: ["submissions"] }],
      ["publish a deal", routes.adminCatchAll.POST as Handler, "POST", "/api/v1/admin/deals/x/publish", { path: ["deals", "x", "publish"] }],
      ["create a deal", routes.adminCatchAll.POST as Handler, "POST", "/api/v1/admin/deals", { path: ["deals"] }],
      ["moderator appointments", routes.moderation.GET as Handler, "GET", "/api/v1/admin/moderation/moderators", { path: ["moderators"] }],
      ["invite a moderator", routes.moderation.POST as Handler, "POST", "/api/v1/admin/moderation/moderators", { path: ["moderators"] }],
      ["decide an appeal", routes.moderation.POST as Handler, "POST", "/api/v1/admin/moderation/appeals/x/decide", { path: ["appeals", "x", "decide"] }],
      ["admin community queue", routes.adminCommunityQueue.GET as Handler, "GET", "/api/v1/admin/community/queue", {}],
      ["admin community reports", routes.adminCommunityReports.GET as Handler, "GET", "/api/v1/admin/community/reports", {}],
      ["community settings", routes.adminCommunities.GET as Handler, "GET", "/api/v1/admin/community/communities", {}],
      ["announcements", routes.announcements.GET as Handler, "GET", "/api/v1/admin/announcements", {}],
      ["staff accounts list", routes.accounts.GET as Handler, "GET", "/api/admin/accounts", {}],
      ["create a staff account", routes.accounts.POST as Handler, "POST", "/api/admin/accounts", {}],
      ["audit log", routes.audit.GET as Handler, "GET", "/api/admin/audit", {}],
      ["intelligence controls", routes.intelligence.GET as Handler, "GET", "/api/v1/admin/intelligence-controls", {}],
      ["network check", routes.network.GET as Handler, "GET", "/api/admin/network-check", {}],
    ];
    for (const [name, handler, method, path, params] of closed) {
      const status = await send(modToken, handler, method, path, params);
      assert.ok(status === 403 || status === 401, `moderator must be refused: ${name} (got ${status})`);
    }
    assert.notEqual(await send(adminToken, routes.moderation.GET as Handler, "GET", "/api/v1/admin/moderation/moderators", { path: ["moderators"] }), 403, "administrators can use it");

    // ---- the open session loses access the moment the appointment changes ----
    await db.moderatorAppointment.update({ where: { id: appointment.id }, data: { probationEndsAt: new Date(Date.now() - 1000) } });
    assert.equal(await send(modToken, routes.moderator.GET as Handler, "GET", "/api/v1/moderator/queue", { path: ["queue"] }), 403, "probation ended with no decision: paused, not confirmed");
    await db.moderatorAppointment.update({ where: { id: appointment.id }, data: { status: "CONFIRMED", probationEndsAt: new Date(Date.now() - 1000) } });
    assert.equal(await send(modToken, routes.moderator.GET as Handler, "GET", "/api/v1/moderator/queue", { path: ["queue"] }), 200, "confirmed");
    const row = await db.moderatorAppointment.findUniqueOrThrow({ where: { id: appointment.id } });
    await apt.revokeModerator({ id: admin.id, role: "ADMIN" }, appointment.id, { version: row.version, reason: "Revoked during the route test" });
    assert.equal(await send(modToken, routes.moderator.GET as Handler, "GET", "/api/v1/moderator/queue", { path: ["queue"] }), 401, "revoked: the session is gone (401), not merely refused");
    assert.equal(await db.authSession.count({ where: { userId: moderator.id } }), 0);
  } finally {
    await wipe();
  }
});
