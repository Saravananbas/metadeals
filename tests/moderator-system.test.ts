import assert from "node:assert/strict";
import test from "node:test";
import * as OTPAuth from "otpauth";

// Disposable MariaDB only; run alone: TESTDB=metadeals_modtest .local/t.sh tests/moderator-system.test.ts
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

test("community moderator: invitation, identity binding, MFA, probation, revocation, limits, restrictions, appeals, hidden content, no publishing", { skip }, async () => {
  await import("dotenv/config");
  process.env.COMMUNITY_ENABLED = "true"; process.env.MESSAGES_ENABLED = "true";
  const { getDatabase } = await import("../src/server/db/client");
  const community = await import("../src/server/community/service");
  const profileSvc = await import("../src/server/community/profile");
  const mod = await import("../src/server/community/moderation");
  const apt = await import("../src/server/community/moderators");
  const access = await import("../src/server/community/moderator-access");
  const disc = await import("../src/server/community/discipline");
  const review = await import("../src/server/community/review");
  const deals = await import("../src/server/deals/service");
  const submissions = await import("../src/server/customer/submissions");
  const authSvc = await import("../src/server/auth/service");
  const db = getDatabase();
  const stamp = Date.now().toString(36);
  const meta = { ipHash: null, userAgent: "test", requestId: "test" };
  const wipe = async () => {
    await db.moderationAppeal.deleteMany({}); await db.moderationEscalation.deleteMany({}); await db.memberRestriction.deleteMany({}); await db.memberWarning.deleteMany({});
    await db.forumNotification.deleteMany({}); await db.forumModerationAction.deleteMany({}); await db.forumReport.deleteMany({});
    await db.moderatorAppointmentEvent.deleteMany({}); await db.moderatorAppointment.deleteMany({});
    await db.forumPostLike.deleteMany({}); await db.forumCommentLike.deleteMany({}); await db.forumSave.deleteMany({}); await db.forumPostVote.deleteMany({}); await db.forumCommentVote.deleteMany({});
    for (let depth = 3; depth >= 0; depth--) await db.forumComment.deleteMany({ where: { depth } });
    await db.dmMessage.deleteMany({}); await db.dmThread.deleteMany({}); await db.forumPost.deleteMany({}); await db.forumProfile.deleteMany({});
    await db.communityDealSubmission.deleteMany({ where: { customer: { email: { startsWith: "zzm-" } } } });
    await db.deal.deleteMany({ where: { createdBy: { email: { startsWith: "zzm-" } } } });
    await db.media.deleteMany({ where: { uploadedBy: { email: { startsWith: "zzm-" } } } }); await db.category.deleteMany({ where: { slug: { startsWith: "zzm-" } } }); await db.merchant.deleteMany({ where: { slug: { startsWith: "zzm-" } } });
    await db.recoveryCode.deleteMany({ where: { user: { email: { startsWith: "zzm-" } } } }); await db.authSession.deleteMany({ where: { user: { email: { startsWith: "zzm-" } } } });
    await db.authToken.deleteMany({ where: { email: { startsWith: "zzm-" } } });
    await db.auditEvent.deleteMany({ where: { OR: [{ actor: { email: { startsWith: "zzm-" } } }, { actorId: null }] } });
    await db.user.updateMany({ where: { email: { startsWith: "zzm-" } }, data: { linkedCustomerId: null } });
    await db.customer.deleteMany({ where: { email: { startsWith: "zzm-" } } }); await db.user.deleteMany({ where: { email: { startsWith: "zzm-" } } });
    await db.customerRateLimit.deleteMany({}); await db.forumCommunity.deleteMany({});
  };
  await wipe();
  try {
    const mkCustomer = (n: string, extra: Record<string, unknown> = {}) => db.customer.create({ data: { name: `Member ${n}`, email: `zzm-${stamp}-${n}@example.com`, emailVerifiedAt: new Date(), createdAt: new Date(Date.now() - 5 * 86_400_000), ...extra } });
    const mkStaff = (n: string, role: "ADMIN" | "SUPER_ADMIN" | "EDITOR") => db.user.create({ data: { email: `zzm-${stamp}-${n}@example.com`, name: n, role, status: "ACTIVE", totpEnabledAt: new Date() } });
    const admin1 = await mkStaff("admin1", "ADMIN"), admin2 = await mkStaff("admin2", "ADMIN"), editor = await mkStaff("editor", "EDITOR");
    const A1 = { id: admin1.id, role: "ADMIN" as const }, A2 = { id: admin2.id, role: "ADMIN" as const };
    const [m1, m2, author, other] = [await mkCustomer("mod1"), await mkCustomer("mod2"), await mkCustomer("author"), await mkCustomer("other")];
    for (const c of [m1, m2, author, other]) await community.ensureProfile(c.id);
    await profileSvc.updateMemberProfile(m1.id, { handle: "mod_one" }); await profileSvc.updateMemberProfile(m2.id, { handle: "mod_two" });
    await profileSvc.updateMemberProfile(author.id, { handle: "author_x" }); await profileSvc.updateMemberProfile(other.id, { handle: "other_x" });
    await community.listCommunities(null);

    // ---------- invitation ----------
    await assert.rejects(() => apt.inviteModerator({ id: editor.id, role: "EDITOR" }, { handle: "mod_one" }), { status: 403 }, "only appointers can invite");
    await assert.rejects(() => apt.inviteModerator(A1, { handle: "nobody_here" }), { status: 404 });
    await db.user.create({ data: { email: m2.email, role: "EDITOR", status: "ACTIVE" } }); // a staff account already uses mod2's email
    await assert.rejects(() => apt.inviteModerator(A1, { handle: "mod_two" }), { status: 409 }, "an email that belongs to staff is refused");
    await db.user.deleteMany({ where: { email: m2.email } });
    const invite = await apt.inviteModerator(A1, { handle: "mod_one", note: "Trusted regular" });
    await assert.rejects(() => apt.inviteModerator(A1, { handle: "mod_one" }), { status: 409 }, "no second open invitation");
    const row = await db.moderatorAppointment.findFirstOrThrow({ where: { customerId: m1.id } });
    assert.notEqual(row.inviteHash, invite.token); assert.equal(row.inviteHash?.length, 64); assert.ok(!JSON.stringify(row).includes(invite.token), "the raw token is never stored");
    assert.ok(new Date(invite.expiresAt).getTime() - Date.now() <= 7 * 86_400_000 + 1000);
    // only the invited member can open it; nobody else learns whether the token is real
    await assert.rejects(() => apt.previewInvitation(other.id, invite.token), { status: 410 });
    await assert.rejects(() => apt.acceptInvitation(other.id, { token: invite.token, agree: true, guidelinesVersion: apt.GUIDELINES_VERSION }, meta), { status: 410 });
    await assert.rejects(() => apt.previewInvitation(m1.id, "x".repeat(40)), { status: 410 });
    assert.equal((await apt.previewInvitation(m1.id, invite.token)).guidelines.length > 3, true);
    await assert.rejects(() => apt.acceptInvitation(m1.id, { token: invite.token, agree: false, guidelinesVersion: apt.GUIDELINES_VERSION }, meta), (e: Error) => e.name === "ZodError", "guideline consent is required");
    await assert.rejects(() => apt.acceptInvitation(m1.id, { token: invite.token, agree: true, guidelinesVersion: "old" }, meta), (e: Error) => e.name === "ZodError");
    // expiry
    await db.moderatorAppointment.update({ where: { id: row.id }, data: { inviteExpiresAt: new Date(Date.now() - 1000) } });
    await assert.rejects(() => apt.acceptInvitation(m1.id, { token: invite.token, agree: true, guidelinesVersion: apt.GUIDELINES_VERSION }, meta), { status: 410 }, "expired");
    await db.moderatorAppointment.update({ where: { id: row.id }, data: { inviteExpiresAt: new Date(Date.now() + 86_400_000) } });
    // race: two simultaneous acceptances, exactly one wins
    const acceptBody = { token: invite.token, agree: true, guidelinesVersion: apt.GUIDELINES_VERSION };
    const raced = await Promise.allSettled([apt.acceptInvitation(m1.id, acceptBody, meta), apt.acceptInvitation(m1.id, acceptBody, meta)]);
    assert.equal(raced.filter((r) => r.status === "fulfilled").length, 1, "an invitation can be used once");
    const accepted = (raced.find((r) => r.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof apt.acceptInvitation>>>).value;
    await assert.rejects(() => apt.acceptInvitation(m1.id, acceptBody, meta), { status: 410 }, "a used token is dead");
    const after = await db.moderatorAppointment.findUniqueOrThrow({ where: { id: row.id } });
    assert.equal(after.status, "PROBATION"); assert.equal(after.inviteHash, null); assert.equal(after.guidelinesVersion, apt.GUIDELINES_VERSION);
    const days = (after.probationEndsAt!.getTime() - Date.now()) / 86_400_000; assert.ok(days > 29.9 && days <= 30);
    const staff = await db.user.findUniqueOrThrow({ where: { id: after.staffUserId! } });
    assert.equal(staff.role, "COMMUNITY_MODERATOR"); assert.equal(staff.linkedCustomerId, m1.id, "bound to the customer who accepted, not matched by email"); assert.equal(staff.status, "PENDING_SETUP");

    // ---------- MFA: nothing works until the staff setup (password + authenticator) is complete ----------
    await assert.rejects(() => access.checkModeratorAccess(staff.id), { status: 403 });
    const setupToken = new URL(accepted.setupUrl).searchParams.get("token")!;
    const { secret } = await authSvc.beginSetup(setupToken, "A-very-long-Moderator-pass-2026!");
    await assert.rejects(() => access.checkModeratorAccess(staff.id), { status: 403 }, "password alone is not enough");
    const code = new OTPAuth.TOTP({ algorithm: "SHA1", digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secret) }).generate();
    await assert.rejects(() => authSvc.completeSetup(setupToken, "000000", meta), /invalid/i);
    assert.ok((await authSvc.completeSetup(setupToken, code, meta)).length > 0, "recovery codes issued");
    const M1 = (await access.checkModeratorAccess(staff.id)).actor;
    assert.equal(M1.role, "COMMUNITY_MODERATOR");
    // a staff account bound to a different customer would not pass
    await db.user.update({ where: { id: staff.id }, data: { linkedCustomerId: other.id } });
    await assert.rejects(() => access.checkModeratorAccess(staff.id), { status: 403 }, "binding must match the appointment");
    await db.user.update({ where: { id: staff.id }, data: { linkedCustomerId: m1.id } });

    // ---------- permission boundaries: moderator cannot reach admin, account, appointment, deal or config services ----------
    const forbidden: Array<[string, () => Promise<unknown>]> = [
      ["list appointments", () => apt.listAppointments(M1)], ["invite", () => apt.inviteModerator(M1, { handle: "other_x" })], ["confirm", () => apt.confirmModerator(M1, row.id, { version: 1 })],
      ["revoke", () => apt.revokeModerator(M1, row.id, { version: 1, reason: "no way" })], ["verify member", () => mod.setMemberVerified(M1, "author_x", true, { reason: "not allowed" })],
      ["suspend member", () => mod.setMemberStatus(M1, "author_x", "suspend", { reason: "not allowed", days: 7 })], ["community settings", () => mod.listCommunitiesAdmin(M1)],
      ["private message reports", () => mod.listDmReports(M1, "OPEN")], ["appeals", () => disc.listAppeals(M1)], ["escalations", () => disc.listEscalations(M1)],
      ["all restrictions", () => disc.listRestrictions(M1)],
      ["save deal", () => deals.saveDeal(db, M1, {})], ["publish deal", () => deals.changeDealState(db, M1, "x", "publish", 1)],
    ];
    for (const [name, run] of forbidden) await assert.rejects(run, (e: Error & { status?: number }) => e.status === 403, `moderator must be refused: ${name}`);

    // ---------- moderation: queue, post/comment actions, reports (reporter hidden), history ----------
    const post = await community.createPost(author.id, { type: "DISCUSSION", communitySlug: "off-topic", title: "A normal discussion thread", bodyHtml: "<p>Nothing wrong here at all today</p>" });
    const comment = await community.createComment(author.id, post.id, { body: "My comment on my own thread here" });
    const bad = await community.createPost(other.id, { type: "DISCUSSION", communitySlug: "off-topic", title: "Spammy buy now thread", bodyHtml: "<p>Buy cheap watches at example dot com now</p>" });
    await community.reportContent(author.id, { targetType: "POST", targetId: bad.id, category: "SPAM" });
    const reports = await mod.listReports(M1, "OPEN");
    assert.equal(reports.total, 1); assert.equal(reports.items[0].reporter.handle, "hidden", "moderators are not told who reported"); assert.equal((await mod.listReports(A1, "OPEN")).items[0].reporter.handle, "author_x");
    const badRow = await db.forumPost.findUniqueOrThrow({ where: { id: bad.id } });
    await mod.actOnPost(M1, bad.id, "remove", { version: badRow.version, reason: "Clear spam advert" });
    assert.equal((await db.forumPost.findUniqueOrThrow({ where: { id: bad.id } })).status, "REMOVED");
    assert.equal(await db.forumModerationAction.count({ where: { actorId: M1.id, action: "post.remove" } }), 1);
    assert.equal(await db.auditEvent.count({ where: { actorId: M1.id, action: "community.post.remove" } }), 1, "history and audit are written together");
    await assert.rejects(() => mod.actOnPost(M1, bad.id, "remove", { version: badRow.version, reason: "Second attempt again" }), { status: 409 });
    // concurrent moderators: one wins
    const p2 = await community.createPost(other.id, { type: "DISCUSSION", communitySlug: "off-topic", title: "Another questionable thread", bodyHtml: "<p>Questionable content for the race test</p>" });
    const v2 = (await db.forumPost.findUniqueOrThrow({ where: { id: p2.id } })).version;
    const race = await Promise.allSettled([mod.actOnPost(M1, p2.id, "remove", { version: v2, reason: "First moderator removes" }), mod.actOnPost(A1, p2.id, "remove", { version: v2, reason: "Second moderator removes" })]);
    assert.equal(race.filter((r) => r.status === "fulfilled").length, 1); assert.equal(await db.forumModerationAction.count({ where: { postId: p2.id, action: "post.remove" } }), 1, "exactly one history row for a raced action");
    const hist = await disc.myHistory(M1); assert.ok(hist.actions.length >= 1);

    // ---------- hidden content does not leak (web list, search, public profile, comments, short link data, mobile-style listing) ----------
    const hiddenSlug = (await db.forumPost.findUniqueOrThrow({ where: { id: bad.id } })).slug;
    assert.ok(!(await community.listDiscussions({}, null)).items.some((i) => i.id === bad.id)); assert.ok(!(await community.listDiscussions({ q: "watches" }, null)).items.some((i) => i.id === bad.id), "search");
    assert.ok(!(await community.listFeed({}, null)).items.some((i) => i.id === bad.id)); await assert.rejects(() => community.getPost(hiddenSlug, null), { status: 404 }, "detail page");
    await assert.rejects(() => community.getPost(hiddenSlug, other.id), { status: 404 }, "not even to a third member");
    assert.ok(!(await profileSvc.getMemberProfile("other_x", null, "discussions")).discussions?.some((d) => d.id === bad.id), "public profile");
    assert.equal((await profileSvc.getMemberProfile("other_x", null)).stats.discussions, 0, "profile counts exclude hidden content");
    assert.ok(!JSON.stringify(await community.communityOverview(null)).includes("Spammy buy now"), "overview/trending");
    // sensitive hiding: atomic hide + history + audit + redacted escalation, no content copied, moderators cannot reread it
    const sens = await community.createPost(other.id, { type: "DISCUSSION", communitySlug: "off-topic", title: "Please call me on my number", bodyHtml: "<p>My private number is 9999999999 and password hunter2</p>" });
    const hid = await disc.hideSensitive(M1, { targetType: "POST", targetId: sens.id, category: "PERSONAL_DATA" });
    assert.equal((await db.forumPost.findUniqueOrThrow({ where: { id: sens.id } })).status, "REMOVED");
    const dump = JSON.stringify([await db.forumModerationAction.findMany({}), await db.auditEvent.findMany({}), await db.forumNotification.findMany({}), await db.moderationEscalation.findMany({})]);
    assert.ok(!dump.includes("9999999999") && !dump.includes("hunter2") && !dump.includes("Please call me"), "no sensitive text in history, audit, notifications or escalations");
    await assert.rejects(() => disc.openEscalated(M1, hid.escalationId), { status: 403 }, "a moderator cannot reopen it");
    const opened = await disc.openEscalated(A1, hid.escalationId); assert.ok(opened.body?.includes("9999999999")); assert.equal(await db.auditEvent.count({ where: { action: "community.sensitive.viewed" } }), 1, "admin access is audited");
    assert.ok(!(await community.listDiscussions({ q: "number" }, null)).items.some((i) => i.id === sens.id));
    await assert.rejects(() => disc.hideSensitive(M1, { targetType: "POST", targetId: sens.id, category: "OTHER" }), { status: 409 }, "already hidden");
    await disc.closeEscalation(A1, hid.escalationId);

    // ---------- warnings and restrictions ----------
    await assert.rejects(() => disc.warnMember(M1, "mod_one", { reason: "warn myself" }), { status: 403 }, "not your own member account");
    const staffMember = await mkCustomer("staffmember"); await community.ensureProfile(staffMember.id); await profileSvc.updateMemberProfile(staffMember.id, { handle: "special_user" });
    await db.user.update({ where: { id: admin2.id }, data: { linkedCustomerId: staffMember.id } });
    await assert.rejects(() => disc.restrictMember(M1, "special_user", { days: 1, reason: "not for staff accounts" }), { status: 403 }, "staff accounts are for administrators");
    await db.user.update({ where: { id: admin2.id }, data: { linkedCustomerId: null } });
    const w = await disc.warnMember(M1, "other_x", { reason: "Please keep posts on topic", postId: bad.id });
    assert.equal((await db.forumNotification.findFirstOrThrow({ where: { type: "MODERATION_WARNING" } })).actorId, null, "the member is not told who warned them");
    await assert.rejects(() => disc.restrictMember(M1, "other_x", { days: 8, reason: "too long for a moderator" }), (e: Error) => e.name === "ZodError", "7 day maximum");
    const r1 = await disc.restrictMember(M1, "other_x", { days: 3, reason: "Repeated spam adverts", postId: bad.id });
    await assert.rejects(() => disc.restrictMember(M1, "other_x", { days: 2, reason: "stack another restriction" }), { status: 409 }, "no stacking by moderators");
    assert.equal((await db.forumProfile.findUniqueOrThrow({ where: { customerId: other.id } })).status, "ACTIVE", "ForumProfile.status is never touched");
    // enforcement in every posting path
    const refused = (fn: () => Promise<unknown>, what: string) => assert.rejects(fn, (e: Error & { status?: number }) => e.status === 403 && /paused/.test(e.message), what);
    await refused(() => community.createPost(other.id, { type: "DISCUSSION", communitySlug: "off-topic", title: "Trying to post anyway", bodyHtml: "<p>Posting during a restriction</p>" }), "discussion");
    await refused(() => community.createComment(other.id, post.id, { body: "Commenting during a restriction" }), "comment");
    await refused(() => community.createComment(other.id, post.id, { body: "Replying during a restriction", parentId: comment.id }), "reply");
    await refused(() => community.editPost(other.id, p2.id, { title: "Edited title during restriction", bodyHtml: "<p>edit</p>" }), "edit post");
    await refused(() => submissions.createSubmission(other.id, { title: "Deal while restricted", brand: "B", description: "Some description", productUrl: "https://www.amazon.in/dp/B000000001", merchantName: "Amazon", priceMinor: 100, mrpMinor: 200 }, Buffer.from("x")), "community deal submission");
    assert.ok(await community.setPostLike(other.id, post.id, true), "likes and reading are not posting");
    assert.ok((await profileSvc.getMemberProfile("other_x", null)).handle, "profile stays public");
    // expiry: no job needed, the clock decides
    await db.memberRestriction.update({ where: { id: r1.restrictionId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const ok = await community.createComment(other.id, post.id, { body: "Back to commenting after expiry" }); assert.ok(ok.id);
    // revoke rules
    const r2 = await disc.restrictMember(M1, "other_x", { days: 1, reason: "Second incident after expiry" });
    await assert.rejects(() => disc.restrictMember(M1, "other_x", { days: 1, reason: "Third incident this month" }), { status: 409 });
    const mod2staff = await db.user.create({ data: { email: `zzm-${stamp}-m2staff@example.com`, role: "COMMUNITY_MODERATOR", status: "ACTIVE", totpEnabledAt: new Date() } });
    await assert.rejects(() => disc.revokeRestriction({ id: mod2staff.id, role: "COMMUNITY_MODERATOR" }, r2.restrictionId, { reason: "lifting someone else's" }), { status: 403 }, "a moderator cannot lift another moderator's restriction");
    await disc.revokeRestriction(M1, r2.restrictionId, { reason: "Resolved with the member" }); await community.createComment(other.id, post.id, { body: "Allowed again after lifting" });
    const adminRestriction = await disc.restrictMember(A1, "other_x", { days: 14, reason: "Admin decision after review" }); assert.ok(adminRestriction.restrictionId, "administrators can go beyond 7 days");
    await disc.revokeRestriction(A1, adminRestriction.restrictionId, { reason: "Admin lifts it" });

    // ---------- appeals: independent decision, overturn undoes the action ----------
    const r3 = await disc.restrictMember(M1, "author_x", { days: 2, reason: "Heated argument in thread" });
    const mine = await disc.myModeration(author.id); assert.equal(mine.restricted, true); assert.equal(mine.restrictions[0].reason, "Heated argument in thread"); assert.ok(!JSON.stringify(mine).includes(M1.id), "moderator identity is not shown");
    await assert.rejects(() => disc.fileAppeal(other.id, { targetType: "RESTRICTION", targetId: r3.restrictionId, message: "Not my restriction at all" }), { status: 404 }, "cannot appeal someone else's");
    await assert.rejects(() => disc.fileAppeal(author.id, { targetType: "RESTRICTION", targetId: r3.restrictionId, message: "short" }), (e: Error) => e.name === "ZodError");
    const appeal = await disc.fileAppeal(author.id, { targetType: "RESTRICTION", targetId: r3.restrictionId, message: "I was only replying to a personal attack." });
    await assert.rejects(() => disc.fileAppeal(author.id, { targetType: "RESTRICTION", targetId: r3.restrictionId, message: "Appealing the same thing again" }), { status: 409 });
    await assert.rejects(() => disc.listAppeals(M1), { status: 403 }); await assert.rejects(() => disc.decideAppeal(M1, appeal.appealId, { version: 1, outcome: "OVERTURNED", note: "moderators decide nothing" }), { status: 403 });
    // the administrator who took the original action cannot decide it
    const adminRestrictionOwn = await disc.restrictMember(A1, "author_x", { days: 10, reason: "Admin restriction for appeal test" });
    const ownAppeal = await disc.fileAppeal(author.id, { targetType: "RESTRICTION", targetId: adminRestrictionOwn.restrictionId, message: "Please review this longer restriction." });
    await assert.rejects(() => disc.decideAppeal(A1, ownAppeal.appealId, { version: 1, outcome: "OVERTURNED", note: "deciding my own action" }), { status: 403 }, "original actor cannot adjudicate");
    assert.equal((await disc.listAppeals(A1)).find((a) => a.id === ownAppeal.appealId)?.mine, true);
    await disc.decideAppeal(A2, ownAppeal.appealId, { version: 1, outcome: "UPHELD", note: "Restriction was proportionate" });
    await assert.rejects(() => disc.decideAppeal(A2, ownAppeal.appealId, { version: 1, outcome: "OVERTURNED", note: "decide twice" }), { status: 409 });
    await disc.decideAppeal(A1, appeal.appealId, { version: 1, outcome: "OVERTURNED", note: "Reviewed: context supports the member" });
    assert.ok((await db.memberRestriction.findUniqueOrThrow({ where: { id: r3.restrictionId } })).revokedAt, "overturning lifts the restriction");
    // appeal a removal: overturn restores the content
    const removalAction = await db.forumModerationAction.findFirstOrThrow({ where: { postId: bad.id, action: "post.remove" } });
    const removalAppeal = await disc.fileAppeal(other.id, { targetType: "ACTION", targetId: removalAction.id, message: "This was not spam, it was a real offer." });
    await assert.rejects(() => disc.decideAppeal(M1, removalAppeal.appealId, { version: 1, outcome: "OVERTURNED", note: "nope not allowed" }), { status: 403 });
    await disc.decideAppeal(A2, removalAppeal.appealId, { version: 1, outcome: "OVERTURNED", note: "Offer was legitimate on review" });
    assert.equal((await db.forumPost.findUniqueOrThrow({ where: { id: bad.id } })).status, "PUBLISHED", "the removed post is back");
    assert.ok((await db.forumNotification.count({ where: { type: "APPEAL_DECIDED" } })) >= 3);

    // ---------- community deal submissions: moderators approve only into a DRAFT, never publish ----------
    const category = await db.category.create({ data: { slug: `zzm-${stamp}`, name: "Moderation fixture" } });
    const merchant = await db.merchant.create({ data: { slug: `zzm-${stamp}`, name: "Moderation fixture", websiteUrl: "https://amazon.in" } });
    const sub = await db.communityDealSubmission.create({ data: { customerId: author.id, title: "Member submitted deal", description: "A decent offer", productUrl: "https://www.amazon.in/dp/B000000002", urlHash: "h".repeat(64), merchantName: "Amazon", priceMinor: 10000, mrpMinor: 20000, imageKey: `zzm-${stamp}.webp`, imageProvider: "local", imageMime: "image/webp", imageBytes: 1, imageWidth: 1, imageHeight: 1 } });
    const approveBody = { version: sub.version, categoryId: category.id, merchantId: merchant.id, title: "Member submitted deal", brand: "", description: "A decent offer", productUrl: "https://www.amazon.in/dp/B000000002", priceMinor: 10000, mrpMinor: 20000 };
    const { version: _unusedVersion, ...bodyNoVersion } = approveBody; void _unusedVersion;
    assert.equal((await review.listSubmissions(M1, "PENDING_REVIEW")).total, 1);
    const modView = JSON.stringify(await review.listSubmissions(M1, "PENDING_REVIEW"));
    assert.ok(!modView.includes("@example.com") && !modView.includes("Member author"), "moderators see the user name only, never the member's email or real name");
    assert.ok(modView.includes("author_x"));
    assert.ok(JSON.stringify(await review.listSubmissions(A1, "PENDING_REVIEW")).includes("@example.com"), "administrators keep the detail they had");
    assert.equal((await review.listSubmissions({ id: editor.id, role: "EDITOR" }, "PENDING_REVIEW")).total, 1, "editors keep the review access they already had");
    const approved = await review.approveSubmission(M1, sub.id, approveBody);
    const draft = await db.deal.findUniqueOrThrow({ where: { id: approved.dealId } });
    assert.equal(draft.status, "DRAFT"); assert.equal(draft.publishedAt, null); assert.equal(draft.affiliateUrl, null); assert.equal(draft.featured, false);
    await assert.rejects(() => deals.changeDealState(db, M1, draft.id, "publish", draft.version), { status: 403 }, "the draft cannot be published by a moderator");
    await assert.rejects(() => deals.saveDeal(db, M1, { ...approveBody, slug: "zzm-x", currency: "INR", rating: null, reviewCount: null, ratingSource: null, affiliateUrl: null, status: "PUBLISHED", options: [], featured: false, trending: false, mediaId: draft.mediaId }, draft.id, draft.version, { moderatorDraft: true }), { status: 403 }, "no editing path");
    await assert.rejects(() => deals.saveDeal(db, M1, { ...bodyNoVersion, slug: "zzm-y", currency: "INR", rating: null, reviewCount: null, ratingSource: null, affiliateUrl: "https://www.amazon.in/dp/AFF", status: "DRAFT", options: [], featured: false, trending: false, mediaId: draft.mediaId, publishedAt: null, startsAt: null, expiresAt: null }, undefined, undefined, { moderatorDraft: true }), { status: 403 }, "affiliate links are never set by a moderator");
    assert.equal(await db.deal.count({ where: { status: "PUBLISHED", id: draft.id } }), 0);

    // ---------- probation: never automatic; confirm, extend, revoke by administrators ----------
    await assert.rejects(() => apt.confirmModerator(A1, row.id, { version: 1 }), { status: 409 }, "cannot confirm before probation ends");
    const cur = await db.moderatorAppointment.findUniqueOrThrow({ where: { id: row.id } });
    await assert.rejects(() => apt.extendProbation(A1, row.id, { version: cur.version, days: 14, reason: "x" }), (e: Error) => e.name === "ZodError", "a reason is required");
    await apt.extendProbation(A1, row.id, { version: cur.version, days: 14, reason: "Needs more time on report handling" });
    const ext = await db.moderatorAppointment.findUniqueOrThrow({ where: { id: row.id } }); assert.equal(ext.extensions, 1); assert.ok(ext.probationEndsAt!.getTime() > cur.probationEndsAt!.getTime() + 13 * 86_400_000);
    await assert.rejects(() => apt.extendProbation(A1, row.id, { version: cur.version, days: 7, reason: "stale version used" }), { status: 409 });
    // probation runs out with no decision: access PAUSES (it never turns into confirmation)
    await db.moderatorAppointment.update({ where: { id: row.id }, data: { probationEndsAt: new Date(Date.now() - 1000) } });
    await assert.rejects(() => access.checkModeratorAccess(staff.id), { status: 403 }, "no auto-confirm, and no access after probation ends undecided");
    assert.equal((await db.moderatorAppointment.findUniqueOrThrow({ where: { id: row.id } })).status, "PROBATION", "status is not changed by time");
    assert.equal((await apt.listAppointments(A1)).find((a) => a.id === row.id)?.decisionDue, true);
    await assert.rejects(() => apt.confirmModerator(M1, row.id, { version: ext.version }), { status: 403 }, "moderators cannot confirm themselves");
    await apt.confirmModerator(A1, row.id, { version: ext.version, note: "Solid work" });
    assert.equal((await access.checkModeratorAccess(staff.id)).appointment.status, "CONFIRMED");
    assert.ok(await access.checkModeratorAccess(staff.id), "confirmed moderators keep access");

    // ---------- revocation: immediate, sessions removed, history kept ----------
    const session = await db.authSession.create({ data: { userId: staff.id, tokenHash: `zzm-${stamp}`.padEnd(64, "0"), lastActivityAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000), absoluteExpiresAt: new Date(Date.now() + 3_600_000) } });
    const fresh = await db.moderatorAppointment.findUniqueOrThrow({ where: { id: row.id } });
    await assert.rejects(() => apt.revokeModerator(A1, row.id, { version: fresh.version, reason: "x" }), (e: Error) => e.name === "ZodError");
    await apt.revokeModerator(A1, row.id, { version: fresh.version, reason: "Repeated judgement problems" });
    await assert.rejects(() => access.checkModeratorAccess(staff.id), { status: 403 }, "access ends at once");
    assert.equal(await db.authSession.count({ where: { id: session.id } }), 0, "open staff sessions are deleted");
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: staff.id } })).status, "SUSPENDED");
    assert.deepEqual((await apt.listAppointments(A1)).find((a) => a.id === row.id)?.events.map((e) => e.action), ["invited", "accepted", "staff_account_bound", "extended", "confirmed", "revoked"], "full history kept");
    assert.equal(await db.forumModerationAction.count({ where: { actorId: M1.id } }) > 0, true, "the moderator's earlier actions remain in the history");
    await assert.rejects(() => apt.revokeModerator(A1, row.id, { version: fresh.version + 1, reason: "Already closed appointment" }), { status: 409 });
    // generic account tools cannot resurrect or create moderators
    await assert.rejects(() => authSvc.updateAccount({ actorId: admin1.id, actorRole: "SUPER_ADMIN", targetId: staff.id, status: "ACTIVE", metadata: meta }), /managed from the moderator appointments page/);
    await assert.rejects(() => authSvc.updateAccount({ actorId: admin1.id, actorRole: "SUPER_ADMIN", targetId: editor.id, role: "COMMUNITY_MODERATOR", metadata: meta }), /managed from the moderator appointments page/);
    // re-appointment of a revoked moderator starts a fresh staff login (old authenticator discarded)
    const again = await apt.inviteModerator(A1, { handle: "mod_one" });
    const accepted2 = await apt.acceptInvitation(m1.id, { token: again.token, agree: true, guidelinesVersion: apt.GUIDELINES_VERSION }, meta);
    const u2 = await db.user.findUniqueOrThrow({ where: { id: staff.id } }); assert.equal(u2.status, "PENDING_SETUP"); assert.equal(u2.totpEnabledAt, null);
    await assert.rejects(() => access.checkModeratorAccess(staff.id), { status: 403 }); assert.ok(accepted2.setupUrl.includes("/admin/setup?token="));
    // revoking an unused invitation
    const invited = await apt.inviteModerator(A1, { handle: "author_x" }); const inv = await db.moderatorAppointment.findFirstOrThrow({ where: { customerId: author.id, status: "INVITED" } });
    await apt.revokeModerator(A1, inv.id, { version: inv.version, reason: "Changed our minds about this" });
    await assert.rejects(() => apt.acceptInvitation(author.id, { token: invited.token, agree: true, guidelinesVersion: apt.GUIDELINES_VERSION }, meta), { status: 410 }, "a revoked invitation cannot be accepted");
  } finally {
    await wipe();
  }
});
