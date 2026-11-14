import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";

// Disposable database only; run alone: DISCUSSIONS_TEST_DB=1 DATABASE_URL=... node --conditions=react-server --import tsx --test --test-force-exit tests/member-extras.test.ts
const databaseUrl = process.env.DATABASE_URL ?? "";
const safe = /\/[^/?]*test[^/?]*(\?|$)/i.test(databaseUrl);
const skip = process.env.DISCUSSIONS_TEST_DB === "1" && safe ? false : "set DISCUSSIONS_TEST_DB=1 and point DATABASE_URL at a disposable database whose name contains 'test'";
process.env.COMMUNITY_ENABLED = "true";
process.env.MESSAGES_ENABLED = "true";
process.env.MESSAGES_REDIS_DISABLED = "true";
process.env.NEXTAUTH_SECRET ??= "test-nextauth-secret-0123456789abcdef0123";
process.env.NEXTAUTH_URL ??= "http://localhost:4123";
process.env.AUTH_SESSION_SECRET ??= "test-session-secret-0123456789abcdef0123";
process.env.AUTH_TOTP_ENCRYPTION_KEY ??= "dGVzdC10b3RwLWtleS1mb3ItYW5hbHl0aWNzLXRlc3Q=";
process.env.AUTH_BOOTSTRAP_EMAIL ??= "test@example.com";
process.env.GOOGLE_NATIVE_CLIENT_IDS = "google-android-id,google-web-id";
process.env.APPLE_NATIVE_CLIENT_IDS = "in.metadeals4u.app";

test("follows, verified badge, reported messages for staff, refresh tokens, Google/Apple app sign-in, push alerts", { skip }, async () => {
  await import("dotenv/config");
  process.env.COMMUNITY_ENABLED = "true"; process.env.MESSAGES_ENABLED = "true";
  process.env.GOOGLE_NATIVE_CLIENT_IDS = "google-android-id,google-web-id"; process.env.APPLE_NATIVE_CLIENT_IDS = "in.metadeals4u.app";
  const { SignJWT, generateKeyPair } = await import("jose");
  const { getDatabase } = await import("../src/server/db/client");
  const community = await import("../src/server/community/service");
  const profileSvc = await import("../src/server/community/profile");
  const m = await import("../src/server/messages/service");
  const mod = await import("../src/server/community/moderation");
  const tokens = await import("../src/server/customer/app-tokens");
  const native = await import("../src/server/customer/native-login");
  const push = await import("../src/server/push/dispatch");
  const db = getDatabase();
  const wipe = async () => {
    await db.dmReport.deleteMany({}); await db.dmBlock.deleteMany({}); await db.dmMessage.deleteMany({}); await db.dmThread.deleteMany({}); await db.forumMemberFollow.deleteMany({});
    await db.forumNotification.deleteMany({}); await db.forumModerationAction.deleteMany({ where: { actor: { email: { startsWith: "zzx-" } } } });
    await db.auditEvent.deleteMany({ where: { actor: { email: { startsWith: "zzx-" } } } });
    await db.forumProfile.deleteMany({});
    await db.customerIdentity.deleteMany({ where: { customer: { email: { startsWith: "zzx-" } } } });
    await db.customer.deleteMany({ where: { email: { startsWith: "zzx-" } } }); await db.user.deleteMany({ where: { email: { startsWith: "zzx-" } } }); await db.customerRateLimit.deleteMany({});
  };
  await wipe();
  const realFetch = globalThis.fetch;
  try {
    const stamp = Date.now().toString(36);
    const mk = (n: number) => db.customer.create({ data: { name: `Real ${n}`, email: `zzx-${stamp}-${n}@example.com`, emailVerifiedAt: new Date(), createdAt: new Date(Date.now() - 3 * 86_400_000) } });
    const [a, b, c] = [await mk(1), await mk(2), await mk(3)];
    const [pa, pb] = [await community.ensureProfile(a.id), await community.ensureProfile(b.id)]; await community.ensureProfile(c.id);
    await profileSvc.updateMemberProfile(a.id, { handle: "alice_x" }); await profileSvc.updateMemberProfile(b.id, { handle: "bob_x" });

    // ---- follows ----
    assert.deepEqual(await profileSvc.setFollow(a.id, "bob_x", true), { following: true, followers: 1 });
    assert.deepEqual(await profileSvc.setFollow(a.id, "Bob_X", true), { following: true, followers: 1 }, "following twice counts once");
    await Promise.all([profileSvc.setFollow(c.id, "bob_x", true), profileSvc.setFollow(c.id, "bob_x", true)]);
    assert.equal(await db.forumMemberFollow.count({ where: { followedId: pb.id } }), 2, "parallel duplicates still count once");
    await assert.rejects(() => profileSvc.setFollow(a.id, "alice_x", true), { status: 404 }, "cannot follow yourself");
    await assert.rejects(() => profileSvc.setFollow(a.id, "nobody_here", true), { status: 404 });
    const asA = await profileSvc.getMemberProfile("bob_x", a.id), asVisitor = await profileSvc.getMemberProfile("bob_x", null), own = await profileSvc.getMemberProfile("bob_x", b.id);
    assert.equal(asA.followers, 2); assert.deepEqual(asA.viewer, { following: true }); assert.equal(asVisitor.viewer, null); assert.equal(own.viewer, null);
    assert.equal((await profileSvc.getMemberProfile("alice_x", null)).following, 1);
    assert.ok(!JSON.stringify(asVisitor).includes(pa.id), "who follows is not listed");
    assert.deepEqual(await profileSvc.setFollow(a.id, "bob_x", false), { following: false, followers: 1 });
    // a block ends follows both ways and prevents new ones
    await profileSvc.setFollow(a.id, "bob_x", true); await profileSvc.setFollow(b.id, "alice_x", true);
    await m.setBlocked(b.id, "alice_x", true);
    assert.equal(await db.forumMemberFollow.count({ where: { OR: [{ followerId: pa.id, followedId: pb.id }, { followerId: pb.id, followedId: pa.id }] } }), 0);
    await assert.rejects(() => profileSvc.setFollow(a.id, "bob_x", true), { status: 403 }); await assert.rejects(() => profileSvc.setFollow(b.id, "alice_x", true), { status: 403 });
    await m.setBlocked(b.id, "alice_x", false);

    // ---- verified badge: staff only ----
    const admin = await db.user.create({ data: { email: `zzx-${stamp}-admin@example.com`, name: "Admin", role: "ADMIN", status: "ACTIVE" } });
    const editor = await db.user.create({ data: { email: `zzx-${stamp}-editor@example.com`, name: "Editor", role: "EDITOR", status: "ACTIVE" } });
    assert.equal((await profileSvc.getMemberProfile("bob_x", null)).verified, false);
    await assert.rejects(() => mod.setMemberVerified({ id: editor.id, role: "EDITOR" }, "bob_x", true, { reason: "Known seller" }), { status: 403 });
    await assert.rejects(() => profileSvc.updateMemberProfile(b.id, { verified: true } as never), (e: Error) => e.name === "ZodError", "a member cannot set it");
    await assert.rejects(() => mod.setMemberVerified({ id: admin.id, role: "ADMIN" }, "bob_x", true, { reason: "no" }), (e: Error) => e.name === "ZodError", "a reason is required");
    assert.deepEqual(await mod.setMemberVerified({ id: admin.id, role: "ADMIN" }, "Bob_X", true, { reason: "Confirmed seller identity" }), { handle: "bob_x", verified: true });
    await assert.rejects(() => mod.setMemberVerified({ id: admin.id, role: "ADMIN" }, "bob_x", true, { reason: "again again" }), { status: 409 });
    assert.equal((await profileSvc.getMemberProfile("bob_x", null)).verified, true); assert.equal((await m.openWith(a.id, "bob_x")).member.verified, true);
    assert.ok(!JSON.stringify(await profileSvc.getMemberProfile("bob_x", null)).includes(admin.id), "who verified is never public");
    assert.equal(await db.forumModerationAction.count({ where: { action: "member.verify", actorId: admin.id } }), 1, "history row written");
    await mod.setMemberVerified({ id: admin.id, role: "ADMIN" }, pb.id, false, { reason: "Seller left the platform" });
    assert.equal((await profileSvc.getMemberProfile("bob_x", null)).verified, false);

    // ---- reported messages for staff ----
    const sent = await m.startThread(a.id, { handle: "bob_x", body: "Buy my cheap watches now" });
    const stranger = await mk(4); await community.ensureProfile(stranger.id);
    await m.reportMessage(b.id, sent.message.id, { category: "SPAM", details: "unsolicited ad" });
    await m.sendMessage(a.id, sent.threadId, { body: "private follow-up never reported" });
    const open = await mod.listDmReports({ id: admin.id, role: "ADMIN" }, "OPEN");
    assert.equal(open.total, 1); assert.equal(open.items[0].snapshot, "Buy my cheap watches now"); assert.equal(open.items[0].reporter.handle, "bob_x"); assert.equal(open.items[0].reported.handle, "alice_x");
    assert.ok(!JSON.stringify(open).includes("never reported"), "only the reported message is visible to staff");
    await assert.rejects(() => mod.listDmReports({ id: editor.id, role: "EDITOR" }, "OPEN"), { status: 403 });
    const report = open.items[0];
    await assert.rejects(() => mod.resolveDmReport({ id: admin.id, role: "ADMIN" }, report.id, { version: 99, outcome: "RESOLVED", resolution: "Warned the member" }), { status: 409 });
    await mod.resolveDmReport({ id: admin.id, role: "ADMIN" }, report.id, { version: report.version, outcome: "RESOLVED", resolution: "Warned the member" });
    await assert.rejects(() => mod.resolveDmReport({ id: admin.id, role: "ADMIN" }, report.id, { version: report.version, outcome: "DISMISSED", resolution: "Second attempt" }), { status: 409 });
    assert.equal((await mod.listDmReports({ id: admin.id, role: "ADMIN" }, "RESOLVED")).items[0].resolution, "Warned the member"); assert.equal((await mod.listDmReports({ id: admin.id, role: "ADMIN" }, "OPEN")).total, 0);
    assert.equal(await db.forumModerationAction.count({ where: { action: "dm-report.resolved" } }), 1);

    // ---- refresh tokens: rotate, replay ends the sign-in, expiry, sign-out ----
    const first = await tokens.issueAppToken(a.id, "Phone");
    assert.match(first.token, /^mdt_/); assert.match(first.refreshToken, /^mdr_/);
    assert.equal(await tokens.customerIdFromAppToken(first.token), a.id);
    assert.ok(new Date(first.expiresAt).getTime() - Date.now() <= 3_600_000, "access token lasts an hour");
    await assert.rejects(() => tokens.customerIdFromAppToken(first.refreshToken), { status: 401 }, "a refresh token is not an access token");
    const second = await tokens.refreshAppToken(first.refreshToken);
    assert.notEqual(second.token, first.token); assert.equal(await tokens.customerIdFromAppToken(second.token), a.id);
    await assert.rejects(() => tokens.customerIdFromAppToken(first.token), { status: 401 }, "the old access token stops working at once");
    await assert.rejects(() => tokens.refreshAppToken(first.refreshToken), { status: 401 }, "an old refresh token is refused");
    await assert.rejects(() => tokens.customerIdFromAppToken(second.token), { status: 401 }, "replaying an old refresh token ends the whole sign-in");
    await assert.rejects(() => tokens.refreshAppToken(second.refreshToken), { status: 401 });
    await assert.rejects(() => tokens.refreshAppToken("mdr_garbage"), { status: 401 }); await assert.rejects(() => tokens.refreshAppToken("mdt_wrongkind"), { status: 401 });
    const third = await tokens.issueAppToken(a.id);
    const racers = await Promise.allSettled([tokens.refreshAppToken(third.refreshToken), tokens.refreshAppToken(third.refreshToken)]);
    assert.equal(racers.filter((r) => r.status === "fulfilled").length, 1, "two simultaneous refreshes cannot both succeed");
    const fourth = await tokens.issueAppToken(a.id); await db.customerAppToken.updateMany({ where: { refreshHash: { not: null }, revokedAt: null, customerId: a.id, expiresAt: fourth.expiresAt ? new Date(fourth.expiresAt) : undefined }, data: { refreshExpiresAt: new Date(Date.now() - 1000) } });
    await assert.rejects(() => tokens.refreshAppToken(fourth.refreshToken), { status: 401 }, "expired refresh token");
    const fifth = await tokens.issueAppToken(b.id); await tokens.revokeAppToken(fifth.refreshToken);
    await assert.rejects(() => tokens.customerIdFromAppToken(fifth.token), { status: 401 }, "signing out with the refresh token ends the sign-in");
    const sixth = await tokens.issueAppToken(b.id); await db.customer.update({ where: { id: b.id }, data: { disabledAt: new Date() } });
    await assert.rejects(() => tokens.refreshAppToken(sixth.refreshToken), { status: 401 }, "disabled account"); await db.customer.update({ where: { id: b.id }, data: { disabledAt: null } });

    // ---- Google and Apple sign-in for the app ----
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    native.useTestKeyForProviderTokens(publicKey);
    const idToken = (provider: "google" | "apple", claims: Record<string, unknown>, over: { aud?: string; iss?: string; exp?: string | number } = {}) =>
      new SignJWT(claims).setProtectedHeader({ alg: "RS256" }).setIssuer(over.iss ?? (provider === "google" ? "https://accounts.google.com" : "https://appleid.apple.com")).setAudience(over.aud ?? (provider === "google" ? "google-android-id" : "in.metadeals4u.app")).setIssuedAt().setExpirationTime(over.exp ?? "5m").sign(privateKey);
    const good = (n: string) => ({ sub: `g-${stamp}-${n}`, email: `zzx-${stamp}-g${n}@example.com`, email_verified: true, name: "Gee Person", picture: "https://example.com/p.png" });
    // new customer
    const signedUp = await native.nativeProviderLogin("google", { idToken: await idToken("google", good("1")), device: "Pixel" }, "1.2.3.4");
    assert.match(signedUp.token, /^mdt_/); assert.match(signedUp.refreshToken, /^mdr_/);
    const created = await db.customer.findUniqueOrThrow({ where: { id: signedUp.customer.id }, include: { identities: true } });
    assert.equal(created.emailVerifiedAt !== null, true); assert.equal(created.identities[0].provider, "google");
    // same provider account again signs into the same customer
    assert.equal((await native.nativeProviderLogin("google", { idToken: await idToken("google", good("1")) }, "1.2.3.4")).customer.id, created.id);
    // a verified email that matches an existing customer links to it (no second account)
    const linked = await native.nativeProviderLogin("google", { idToken: await idToken("google", { ...good("2"), email: a.email }) }, "1.2.3.4");
    assert.equal(linked.customer.id, a.id); assert.equal(await db.customer.count({ where: { email: a.email } }), 1);
    // refusals: unverified email, wrong audience, wrong issuer, expired, wrong signature, garbage, missing config
    await assert.rejects(async () => native.nativeProviderLogin("google", { idToken: await idToken("google", { ...good("3"), email_verified: false }) }, "1.2.3.4"), { status: 403 });
    for (const bad of [await idToken("google", good("4"), { aud: "someone-elses-app" }), await idToken("google", good("5"), { iss: "https://evil.example" }), await idToken("google", good("6"), { exp: Math.floor(Date.now() / 1000) - 600 }), "not.a.token", ""])
      await assert.rejects(async () => native.nativeProviderLogin("google", { idToken: bad }, "1.2.3.4"), { status: 401 });
    const other = await generateKeyPair("RS256");
    const forged = await new SignJWT(good("7")).setProtectedHeader({ alg: "RS256" }).setIssuer("https://accounts.google.com").setAudience("google-android-id").setIssuedAt().setExpirationTime("5m").sign(other.privateKey);
    await assert.rejects(async () => native.nativeProviderLogin("google", { idToken: forged }, "1.2.3.4"), { status: 401 }, "signature must match the provider key");
    assert.equal(await db.customer.count({ where: { email: { contains: `g${stamp}` } } }), 0);
    // Apple: nonce required and must match (as given or as its SHA-256)
    const { createHash } = await import("node:crypto");
    const apple = { sub: `a-${stamp}`, email: `zzx-${stamp}-apple@example.com`, email_verified: "true" };
    await assert.rejects(async () => native.nativeProviderLogin("apple", { idToken: await idToken("apple", { ...apple, nonce: createHash("sha256").update("n-1").digest("hex") }) }, "1.2.3.4"), { status: 401 }, "no nonce sent");
    await assert.rejects(async () => native.nativeProviderLogin("apple", { idToken: await idToken("apple", { ...apple, nonce: "other" }), nonce: "n-1" }, "1.2.3.4"), { status: 401 }, "wrong nonce");
    const ap = await native.nativeProviderLogin("apple", { idToken: await idToken("apple", { ...apple, nonce: createHash("sha256").update("n-1").digest("hex") }), nonce: "n-1", name: "Apple Person" }, "1.2.3.4");
    assert.equal((await db.customer.findUniqueOrThrow({ where: { id: ap.customer.id } })).name, "Apple Person", "Apple's first-time name comes from the app");
    // disabled account
    await db.customer.update({ where: { id: ap.customer.id }, data: { disabledAt: new Date() } });
    await assert.rejects(async () => native.nativeProviderLogin("apple", { idToken: await idToken("apple", { ...apple, nonce: "n-2" }), nonce: "n-2" }, "1.2.3.4"), { status: 403 });
    // not configured
    process.env.APPLE_NATIVE_CLIENT_IDS = "";
    await assert.rejects(async () => native.nativeProviderLogin("apple", { idToken: "x" }, "1.2.3.4"), { status: 503 }); process.env.APPLE_NATIVE_CLIENT_IDS = "in.metadeals4u.app";
    native.useTestKeyForProviderTokens(null);

    // ---- push alerts: registration, provider off, provider on (mocked), no message text, muted, unregistered token cleanup ----
    await assert.rejects(() => push.registerPushToken(a.id, { token: "short", platform: "android" }), { status: 400 });
    await assert.rejects(() => push.registerPushToken(a.id, { token: "x".repeat(40), platform: "windows" }), { status: 400 });
    const tokenB = "fcm-token-for-bob-0123456789abcdef";
    assert.deepEqual(await push.registerPushToken(b.id, { token: tokenB, platform: "android", device: "Pixel 8" }), { registered: true, delivery: "not_configured" });
    await push.registerPushToken(b.id, { token: tokenB, platform: "android" });
    assert.equal(await db.devicePushToken.count({ where: { token: tokenB } }), 1, "registering twice keeps one row");
    await push.registerPushToken(c.id, { token: tokenB, platform: "ios" });
    assert.equal((await db.devicePushToken.findUniqueOrThrow({ where: { token: tokenB } })).customerId, c.id, "the phone moves to whoever signed in on it last");
    await push.registerPushToken(b.id, { token: tokenB, platform: "android" });
    delete process.env.FCM_PROJECT_ID; delete process.env.FCM_SERVICE_ACCOUNT_JSON;
    assert.deepEqual(await push.pushToCustomer(b.id, { title: "t", body: "b", data: {} }), { sent: 0, removed: 0 }, "nothing is sent without a provider");
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
    process.env.FCM_PROJECT_ID = "demo-project";
    process.env.FCM_SERVICE_ACCOUNT_JSON = JSON.stringify({ client_email: "svc@demo-project.iam.gserviceaccount.com", private_key: rsa.privateKey.export({ type: "pkcs8", format: "pem" }).toString() });
    push.forgetPushAccessToken();
    const calls: { url: string; body: string }[] = []; let fcmStatus = 200;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      calls.push({ url: u, body: String(init?.body ?? "") });
      if (u.includes("oauth2")) return Response.json({ access_token: "ya29.test", expires_in: 3600 });
      return fcmStatus === 200 ? Response.json({ name: "ok" }) : new Response(JSON.stringify({ error: { status: "UNREGISTERED" } }), { status: 404 });
    }) as typeof fetch;
    // a real message to a member with a registered phone and no open connection triggers one alert without the message text
    await m.sendMessage(a.id, sent.threadId, { body: "SECRET-TEXT-should-not-leave" });
    await new Promise((r) => setTimeout(r, 400));
    const alerts = calls.filter((x) => x.url.includes("fcm.googleapis.com"));
    assert.equal(alerts.length, 1); assert.ok(alerts[0].url.includes("/projects/demo-project/messages:send"));
    assert.ok(!alerts[0].body.includes("SECRET-TEXT") && alerts[0].body.includes(tokenB) && alerts[0].body.includes(sent.threadId), "alert carries the thread id, never the text");
    assert.ok(calls.some((x) => x.url.includes("oauth2") && x.body.includes("assertion=")), "service account signs a JWT for its access token");
    // muted conversation: no alert
    await m.updateThread(b.id, sent.threadId, { muted: true }); calls.length = 0;
    await m.sendMessage(a.id, sent.threadId, { body: "muted one" }); await new Promise((r) => setTimeout(r, 300));
    assert.equal(calls.filter((x) => x.url.includes("fcm.googleapis.com")).length, 0, "muted: no alert");
    await m.updateThread(b.id, sent.threadId, { muted: false });
    // provider says the token is dead: it is forgotten
    fcmStatus = 404;
    assert.deepEqual(await push.pushToCustomer(b.id, { title: "t", body: "b", data: {} }), { sent: 0, removed: 1 });
    assert.equal(await db.devicePushToken.count({ where: { token: tokenB } }), 0);
    await push.registerPushToken(b.id, { token: tokenB, platform: "android" });
    assert.deepEqual(await push.unregisterPushToken(b.id, tokenB), { removed: true }); assert.equal(await db.devicePushToken.count({ where: { token: tokenB } }), 0);
  } finally {
    globalThis.fetch = realFetch; delete process.env.FCM_PROJECT_ID; delete process.env.FCM_SERVICE_ACCOUNT_JSON;
    await db.devicePushToken.deleteMany({ where: { customer: { email: { startsWith: "zzx-" } } } }).catch(() => {});
    await db.customerAppToken.deleteMany({ where: { customer: { email: { startsWith: "zzx-" } } } }).catch(() => {});
    await wipe();
  }
});
