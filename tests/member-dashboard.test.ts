import assert from "node:assert/strict";
import test from "node:test";

// Disposable database only; run alone: DISCUSSIONS_TEST_DB=1 DATABASE_URL=...test... node --conditions=react-server --import tsx --test --test-force-exit tests/member-dashboard.test.ts
const databaseUrl = process.env.DATABASE_URL ?? "";
const safe = /\/[^/?]*test[^/?]*(\?|$)/i.test(databaseUrl);
const skip = process.env.DISCUSSIONS_TEST_DB === "1" && safe ? false : "set DISCUSSIONS_TEST_DB=1 and point DATABASE_URL at a disposable database whose name contains 'test'";
process.env.COMMUNITY_ENABLED = "true";
process.env.NEXTAUTH_SECRET ??= "test-nextauth-secret-0123456789abcdef0123";
process.env.NEXTAUTH_URL ??= "http://localhost:4123";
process.env.AUTH_SESSION_SECRET ??= "test-session-secret-0123456789abcdef0123";
process.env.AUTH_TOTP_ENCRYPTION_KEY ??= "dGVzdC10b3RwLWtleS1mb3ItYW5hbHl0aWNzLXRlc3Q=";
process.env.AUTH_BOOTSTRAP_EMAIL ??= "test@example.com";

test("member dashboard: statistics, preferences, password change and saved deals use only the signed-in member's own data", { skip }, async () => {
  await import("dotenv/config");
  const { getDatabase } = await import("../src/server/db/client");
  const { hashPassword, verifyPassword } = await import("../src/server/auth/crypto");
  const d = await import("../src/server/customer/dashboard");
  const db = getDatabase();
  const stamp = Date.now().toString(36);
  const mail = (n: string) => `zzd-${stamp}-${n}@example.com`;
  const wipe = async () => {
    await db.customerPreference.deleteMany({ where: { customer: { email: { startsWith: "zzd-" } } } });
    await db.savedDeal.deleteMany({ where: { customer: { email: { startsWith: "zzd-" } } } });
    await db.communityDealSubmission.deleteMany({ where: { customer: { email: { startsWith: "zzd-" } } } });
    await db.customerAppToken.deleteMany({ where: { customer: { email: { startsWith: "zzd-" } } } });
    await db.customerRateLimit.deleteMany({});
    await db.forumProfile.deleteMany({ where: { customer: { email: { startsWith: "zzd-" } } } });
    await db.customer.deleteMany({ where: { email: { startsWith: "zzd-" } } });
  };
  await wipe();
  try {
    const oldPassword = "Old-pass-" + stamp + "!";
    const a = await db.customer.create({ data: { name: "Dash A", email: mail("a"), emailVerifiedAt: new Date(), passwordHash: await hashPassword(oldPassword) } });
    const b = await db.customer.create({ data: { name: "Dash B", email: mail("b"), emailVerifiedAt: new Date(), passwordHash: await hashPassword("Other-pass-1!") } });
    const social = await db.customer.create({ data: { name: "Dash Social", email: mail("s"), emailVerifiedAt: new Date() } });
    const sub = (customerId: string, n: number, status: "PENDING_REVIEW" | "APPROVED" | "REJECTED") => db.communityDealSubmission.create({ data: { customerId, status, title: `Deal ${n}`, description: "A test description", productUrl: `https://example.com/p/${stamp}/${n}`, urlHash: `${stamp}${n}`.padEnd(64, "0"), priceMinor: 10000, imageKey: "k", imageProvider: "local", imageMime: "image/webp", imageBytes: 1, imageWidth: 1, imageHeight: 1 } });
    await sub(a.id, 1, "PENDING_REVIEW"); await sub(a.id, 2, "APPROVED"); await sub(a.id, 3, "REJECTED"); await sub(b.id, 4, "APPROVED"); await sub(b.id, 5, "APPROVED");

    // ---- statistics: counted from this member's own rows only, no sample numbers ----
    const sa = await d.getStats(a.id), sb = await d.getStats(b.id);
    assert.deepEqual(sa, { submitted: 3, approved: 1, live: 0, views: 0, helpfulVotes: 0, badges: 0 });
    assert.equal(sb.submitted, 2); assert.equal(sb.approved, 2);
    assert.equal((await d.getStats(social.id)).submitted, 0);

    // ---- dashboard payload: own data, never a password hash ----
    const board = await d.getDashboard(a.id);
    assert.equal(board.account.email, a.email); assert.equal(board.account.hasPassword, true); assert.equal(board.stats.submitted, 3);
    assert.ok(!JSON.stringify(board).includes("passwordHash") && !JSON.stringify(board).includes("$argon2"));
    assert.ok(board.forum?.handle);

    // ---- preferences: defaults, partial updates keep the rest, strict input ----
    assert.deepEqual(await d.getPreferences(a.id), { dealAlerts: true, emailUpdates: true, frequency: "IMMEDIATE", categorySlugs: [] });
    const first = await d.updatePreferences(a.id, { dealAlerts: false });
    assert.equal(first.dealAlerts, false); assert.equal(first.emailUpdates, true);
    const second = await d.updatePreferences(a.id, { frequency: "WEEKLY" });
    assert.equal(second.frequency, "WEEKLY"); assert.equal(second.dealAlerts, false, "an earlier choice is not lost");
    assert.equal((await d.getPreferences(b.id)).dealAlerts, true, "another member is unaffected");
    await assert.rejects(d.updatePreferences(a.id, { frequency: "HOURLY" }));
    await assert.rejects(d.updatePreferences(a.id, { customerId: b.id }), "the member id is never taken from the body");
    await assert.rejects(d.updatePreferences(a.id, { categorySlugs: ["no-such-category-" + stamp] }), /does not exist/);
    const cat = await db.category.findFirst({ select: { slug: true } });
    if (cat) assert.deepEqual((await d.updatePreferences(a.id, { categorySlugs: [cat.slug] })).categorySlugs, [cat.slug]);

    // ---- password change ----
    await assert.rejects(d.changePassword(a.id, { currentPassword: "wrong", newPassword: "New-pass-77!" }), /not correct/);
    await assert.rejects(d.changePassword(a.id, { currentPassword: oldPassword, newPassword: "short" }));
    await assert.rejects(d.changePassword(a.id, { currentPassword: oldPassword, newPassword: oldPassword }), /not used just now|less|Choose/);
    await assert.rejects(d.changePassword(social.id, { currentPassword: "x", newPassword: "New-pass-77!" }), /Google or Apple/);
    await assert.rejects(d.changePassword(a.id, { currentPassword: oldPassword, newPassword: "New-pass-77!", extra: 1 }));
    await db.customerRateLimit.deleteMany({});
    assert.deepEqual(await d.changePassword(a.id, { currentPassword: oldPassword, newPassword: "New-pass-77!" }), { changed: true });
    const after = await db.customer.findUniqueOrThrow({ where: { id: a.id }, select: { passwordHash: true } });
    assert.ok(after.passwordHash && await verifyPassword(after.passwordHash, "New-pass-77!") && !(await verifyPassword(after.passwordHash, oldPassword)));

    // ---- saved deals: only public deals, only your own list ----
    await assert.rejects(d.saveDeal(a.id, { dealId: "does-not-exist" }), /could not be found/);
    assert.deepEqual(await d.listSavedDeals(a.id), []);
    assert.deepEqual(await d.removeSavedDeal(a.id, { dealId: "does-not-exist" }), { removed: 0 });
    await assert.rejects(d.saveDeal(a.id, { dealId: "x", customerId: b.id }));


    // ---- City / State is one value: either place updates both ----
    const prof = await import("../src/server/customer/profile"), pub = await import("../src/server/community/profile");
    await prof.updateProfile(a.id, { name: "Dash A", location: "Hyderabad" });
    assert.equal((await db.forumProfile.findUniqueOrThrow({ where: { customerId: a.id } })).location, "Hyderabad", "account form updates the public city");
    await pub.updateMemberProfile(a.id, { location: "Chennai, Tamil Nadu" });
    assert.equal((await db.customer.findUniqueOrThrow({ where: { id: a.id } })).location, "Chennai, Tamil Nadu", "public form updates the account city");
    assert.equal((await d.getDashboard(a.id)).account.location, "Chennai, Tamil Nadu");
    await pub.updateMemberProfile(a.id, { bio: "only the bio" });
    assert.equal((await d.getDashboard(a.id)).account.location, "Chennai, Tamil Nadu", "changing another field keeps the city");

    // ---- moderator invite type-ahead: admin only, user names only, matches as you type ----
    const apt = await import("../src/server/community/moderators");
    const ha = `zzdq_${stamp}_alpha`.slice(0, 30), hb = `zzdq_${stamp}_beta`.slice(0, 30);
    await db.forumProfile.upsert({ where: { customerId: a.id }, update: { handle: ha }, create: { customerId: a.id, handle: ha, displayName: "Alpha Person" } });
    await db.forumProfile.upsert({ where: { customerId: b.id }, update: { handle: hb }, create: { customerId: b.id, handle: hb } });
    const admin = { id: "any", role: "ADMIN" } as never;
    const hits = await apt.searchInvitableMembers(admin, `zzdq_${stamp}`);
    assert.deepEqual(hits.map((h) => h.handle).sort(), [ha, hb].sort());
    assert.ok(!JSON.stringify(hits).includes("@example.com"), "no email in suggestions");
    assert.equal((await apt.searchInvitableMembers(admin, "ALPHA PERSON".slice(0, 5)))[0]?.handle, ha, "display names match too, any case");
    assert.deepEqual(await apt.searchInvitableMembers(admin, ""), []);
    await assert.rejects(apt.searchInvitableMembers({ id: "m", role: "COMMUNITY_MODERATOR" } as never, "zz"), /permission|not allowed|403/i);
    await assert.rejects(apt.searchInvitableMembers({ id: "e", role: "EDITOR" } as never, "zz"));
    await db.customer.update({ where: { id: b.id }, data: { disabledAt: new Date() } });
    assert.deepEqual((await apt.searchInvitableMembers(admin, `zzdq_${stamp}`)).map((h) => h.handle), [ha], "disabled accounts are not offered");
  } finally {
    await wipe();
  }
});
