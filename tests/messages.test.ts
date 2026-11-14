import assert from "node:assert/strict";
import test from "node:test";

// Disposable database only; run alone: DISCUSSIONS_TEST_DB=1 DATABASE_URL=... node --conditions=react-server --import tsx --test --test-force-exit tests/messages.test.ts
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

test("private messages: start, send, isolation, receipts, unread, mute, remove, block, report, shares, live events, app tokens", { skip }, async () => {
  await import("dotenv/config");
  process.env.COMMUNITY_ENABLED = "true"; process.env.MESSAGES_ENABLED = "true";
  const { getDatabase } = await import("../src/server/db/client");
  const m = await import("../src/server/messages/service");
  const bus = await import("../src/server/messages/bus");
  const community = await import("../src/server/community/service");
  const tokens = await import("../src/server/customer/app-tokens");
  const http = await import("../src/server/customer/http");
  const db = getDatabase();
  const wipe = async () => {
    await db.dmReport.deleteMany({}); await db.dmBlock.deleteMany({}); await db.dmMessage.deleteMany({}); await db.dmThread.deleteMany({});
    await db.forumNotification.deleteMany({}); await db.forumSave.deleteMany({}); await db.forumPostLike.deleteMany({}); await db.forumCommentLike.deleteMany({}); await db.forumPostVote.deleteMany({}); await db.forumCommentVote.deleteMany({});
    for (let depth = 3; depth >= 0; depth--) await db.forumComment.deleteMany({ where: { depth } });
    await db.forumPost.deleteMany({}); await db.forumProfile.deleteMany({});
    await db.customer.deleteMany({ where: { email: { startsWith: "zzdm-" } } }); await db.forumCommunity.deleteMany({}); await db.customerRateLimit.deleteMany({});
  };
  await wipe();
  try {
    const stampId = Date.now().toString(36);
    const mk = (n: number, extra: Record<string, unknown> = {}) => db.customer.create({ data: { name: `Real ${n}`, email: `zzdm-${stampId}-${n}@example.com`, emailVerifiedAt: new Date(), createdAt: new Date(Date.now() - 3 * 86_400_000), ...extra } });
    const [a, b, c] = [await mk(1), await mk(2), await mk(3)];
    const [pa, pb, pc] = [await community.ensureProfile(a.id), await community.ensureProfile(b.id), await community.ensureProfile(c.id)];

    // Live events are collected per member, exactly as a connected device would receive them
    const got: Record<string, { type: string; data: Record<string, unknown> }[]> = { a: [], b: [], c: [] };
    const offA = bus.subscribe(pa.id, (e) => got.a.push(e)), offB = bus.subscribe(pb.id, (e) => got.b.push(e)), offC = bus.subscribe(pc.id, (e) => got.c.push(e));
    const offB2: { type: string }[] = []; const offSecond = bus.subscribe(pb.id, (e) => offB2.push(e));
    assert.ok(offA && offB && offC && offSecond);

    // Any member can start a conversation; no request step; validation
    await assert.rejects(() => m.startThread(a.id, { handle: pa.handle, body: "hi me" }), { status: 400 });
    await assert.rejects(() => m.startThread(a.id, { handle: "nobody_here", body: "hi" }), { status: 404 });
    await assert.rejects(() => m.startThread(a.id, { handle: pb.handle }), /Write a message first/);
    await assert.rejects(() => m.startThread(a.id, { handle: pb.handle, body: "x".repeat(2001) }), /too long/);
    const first = await m.startThread(a.id, { handle: pb.handle, body: "Hello <b>there</b> <script>alert(1)</script>", clientId: "client-0001" });
    assert.equal(first.message.body, "Hello <b>there</b> <script>alert(1)</script>", "stored as plain text; the page escapes it when rendering");
    assert.equal(first.message.status, "sent"); assert.equal(first.duplicate, false);
    const threadId = first.threadId;

    // The event is only published after the message exists, to both members, and never to a third member
    assert.equal(got.b.filter((e) => e.type === "message").length, 1); assert.equal(offB2.filter((e) => e.type === "message").length, 1, "every open session of the recipient gets it");
    assert.equal((got.b.find((e) => e.type === "message")!.data.message as { id: string; mine: boolean }).id, first.message.id); assert.equal((got.b.find((e) => e.type === "message")!.data.message as { mine: boolean }).mine, false);
    assert.equal(got.a.filter((e) => e.type === "message").length, 1, "the sender's other sessions are updated too");
    assert.equal(got.c.length, 0, "nobody else receives anything");
    assert.ok(await db.dmMessage.findUnique({ where: { id: first.message.id } }), "persisted");

    // Retried send with the same device id: one stored message, no second event
    const retry = await m.sendMessage(a.id, threadId, { body: "Hello <b>there</b> <script>alert(1)</script>", clientId: "client-0001" });
    assert.equal(retry.duplicate, true); assert.equal(retry.message.id, first.message.id);
    assert.equal(await db.dmMessage.count({ where: { threadId } }), 1); assert.equal(got.b.filter((e) => e.type === "message").length, 1);
    // Starting again (either direction) reuses the single conversation of the pair
    const reply = await m.startThread(b.id, { handle: pa.handle, body: "Hi back" });
    assert.equal(reply.threadId, threadId); assert.equal(await db.dmThread.count({}), 1);
    await Promise.all([m.startThread(a.id, { handle: pc.handle, body: "one" }), m.startThread(c.id, { handle: pa.handle, body: "two" })]);
    assert.equal(await db.dmThread.count({}), 2, "two members writing first at the same moment still share one conversation");

    // Ordering and paging
    await m.sendMessage(a.id, threadId, { body: "third" });
    const view = await m.getThread(b.id, threadId);
    assert.deepEqual(view.messages.map((x) => x.body), ["Hello <b>there</b> <script>alert(1)</script>", "Hi back", "third"]);
    assert.deepEqual(view.messages.map((x) => x.mine), [false, true, false]);

    // Isolation: a third member cannot read, write, mark, mute, remove or report in someone else's conversation, whatever id they send
    for (const attempt of [() => m.getThread(c.id, threadId), () => m.sendMessage(c.id, threadId, { body: "let me in" }), () => m.markRead(c.id, threadId), () => m.typing(c.id, threadId), () => m.updateThread(c.id, threadId, { muted: true }), () => m.removeThread(c.id, threadId)])
      await assert.rejects(attempt, { status: 404 });
    await assert.rejects(() => m.reportMessage(c.id, first.message.id, { category: "SPAM" }), { status: 404 });
    assert.ok(!(await m.listThreads(c.id)).items.some((t) => t.id === threadId));
    assert.ok(!JSON.stringify(await m.listThreads(b.id)).includes("@example.com"), "no email or account detail in the inbox");

    // Unread counts and receipts
    let inboxB = await m.listThreads(b.id);
    assert.equal(inboxB.items[0].id, threadId); assert.equal(inboxB.items[0].unread, 1, "only the message after B's own reply is unread"); assert.equal(inboxB.unread, 1);
    assert.equal(inboxB.items[0].last.excerpt, "third");
    assert.equal((await m.getThread(a.id, threadId)).messages.at(-1)?.status, "sent", "opening the list or history does not mark anything read");
    await m.markDelivered(b.id);
    assert.equal((await m.getThread(a.id, threadId)).messages.at(-1)?.status, "delivered");
    assert.ok(got.a.some((e) => e.type === "delivered" && e.data.threadId === threadId));
    await m.markRead(b.id, threadId);
    assert.equal((await m.getThread(a.id, threadId)).messages.at(-1)?.status, "read");
    assert.ok(got.a.some((e) => e.type === "read" && e.data.by === "other")); assert.ok(got.b.some((e) => e.type === "read" && e.data.by === "me"));
    inboxB = await m.listThreads(b.id); assert.equal(inboxB.unread, 0); assert.equal(inboxB.items[0].unread, 0);
    assert.equal((await m.listThreads(b.id, { filter: "unread" })).items.length, 0);

    // Typing reaches only the other participant
    const before = got.b.filter((e) => e.type === "typing").length;
    await m.typing(a.id, threadId);
    assert.equal(got.b.filter((e) => e.type === "typing").length, before + 1); assert.equal(got.c.filter((e) => e.type === "typing").length, 0);

    // Notifications: one unread notice per conversation, recipient only, none for yourself, cleared when read
    await m.sendMessage(a.id, threadId, { body: "ping 1" }); await m.sendMessage(a.id, threadId, { body: "ping 2" });
    const notes = await db.forumNotification.findMany({ where: { type: "MESSAGE", postId: threadId, readAt: null, recipientId: pb.id } });
    assert.equal(notes.length, 1, "more messages refresh the one notice"); assert.equal(notes[0].recipientId, pb.id); assert.equal(notes[0].postTitle, "ping 2");
    assert.equal(await db.forumNotification.count({ where: { type: "MESSAGE", recipientId: pa.id, actorId: pa.id } }), 0, "nobody is notified about their own message");
    await m.markRead(b.id, threadId);
    assert.equal(await db.forumNotification.count({ where: { type: "MESSAGE", postId: threadId, readAt: null, recipientId: pb.id } }), 0);

    // Mute: delivered and stored, counted in the thread, but no notice and not in the badge
    await m.updateThread(b.id, threadId, { muted: true });
    await m.sendMessage(a.id, threadId, { body: "muted hello" });
    assert.equal(await db.forumNotification.count({ where: { type: "MESSAGE", postId: threadId, readAt: null, recipientId: pb.id } }), 0, "muted: no notice");
    inboxB = await m.listThreads(b.id); assert.equal(inboxB.items[0].unread, 1); assert.equal(inboxB.unread, 0, "muted conversations stay out of the badge"); assert.equal(inboxB.items[0].muted, true);
    assert.equal((got.b.filter((e) => e.type === "message").at(-1)?.data as { muted: boolean }).muted, true);
    await m.updateThread(b.id, threadId, { muted: false });

    // Archive hides it from the inbox until a new message arrives
    await m.updateThread(b.id, threadId, { archived: true });
    assert.ok(!(await m.listThreads(b.id)).items.some((t) => t.id === threadId)); assert.ok((await m.listThreads(b.id, { filter: "archived" })).items.some((t) => t.id === threadId));
    await m.sendMessage(a.id, threadId, { body: "back again" });
    assert.ok((await m.listThreads(b.id)).items.some((t) => t.id === threadId));

    // Remove from my inbox: my copy is hidden, the other member keeps everything, nothing is deleted, a new message shows only what came after
    const total = await db.dmMessage.count({ where: { threadId } });
    await m.removeThread(b.id, threadId);
    assert.ok(!(await m.listThreads(b.id)).items.some((t) => t.id === threadId)); assert.equal((await m.getThread(b.id, threadId)).messages.length, 0);
    assert.equal((await m.getThread(a.id, threadId)).messages.length, total, "the other member's history is untouched"); assert.equal(await db.dmMessage.count({ where: { threadId } }), total);
    await new Promise((r) => setTimeout(r, 15));
    await m.sendMessage(a.id, threadId, { body: "after removal" });
    assert.deepEqual((await m.getThread(b.id, threadId)).messages.map((x) => x.body), ["after removal"]);

    // Shares: only public records; rendered from the live record; a removed discussion shows as unavailable
    await community.listCommunities(null);
    const post = await community.createPost(a.id, { type: "DISCUSSION", communitySlug: "off-topic", title: "Upcoming sale thread", bodyHtml: "<p>What do you expect from the sale</p>" });
    const shared = await m.sendMessage(a.id, threadId, { share: { kind: "DISCUSSION", id: post.id }, body: "look" });
    assert.equal(shared.message.kind, "DISCUSSION"); assert.equal((shared.message.share as { title: string }).title, "Upcoming sale thread"); assert.equal((shared.message.share as { url: string }).url, `/community/post/${post.slug}`);
    await assert.rejects(() => m.sendMessage(a.id, threadId, { share: { kind: "DISCUSSION", id: "no-such" } }), { status: 404 });
    await assert.rejects(() => m.sendMessage(a.id, threadId, { share: { kind: "DEAL", id: "no-such-deal" } }), { status: 404 });
    await db.forumPost.update({ where: { id: post.id }, data: { status: "REMOVED" } });
    assert.deepEqual((await m.getThread(b.id, threadId)).messages.at(-1)?.share, { kind: "DISCUSSION", unavailable: true });

    // Report: only the other member's message, once; the text is copied for staff at that moment
    const theirs = (await m.getThread(b.id, threadId)).messages.find((x) => !x.mine && x.body === "after removal")!;
    assert.deepEqual(await m.reportMessage(b.id, theirs.id, { category: "SPAM", details: "unwanted" }), { reported: true, duplicate: false });
    assert.deepEqual(await m.reportMessage(b.id, theirs.id, { category: "SPAM" }), { reported: true, duplicate: true });
    await assert.rejects(() => m.reportMessage(a.id, theirs.id, { category: "SPAM" }), { status: 404 });
    assert.equal((await db.dmReport.findFirstOrThrow({})).snapshot, "after removal");

    // Block: enforced on the server in both directions, cannot be bypassed by starting again, reversible only by the blocker
    await m.setBlocked(b.id, pa.handle, true); await m.setBlocked(b.id, pa.handle, true);
    await assert.rejects(() => m.sendMessage(a.id, threadId, { body: "still there?" }), { status: 403 });
    await assert.rejects(() => m.startThread(a.id, { handle: pb.handle, body: "new try" }), { status: 403 });
    await assert.rejects(() => m.sendMessage(b.id, threadId, { body: "I blocked you but write anyway" }), { status: 403 });
    const typingBefore = got.b.filter((e) => e.type === "typing").length;
    await new Promise((r) => setTimeout(r, 1600)); await m.typing(a.id, threadId);
    assert.equal(got.b.filter((e) => e.type === "typing").length, typingBefore, "no typing signal across a block");
    assert.equal((await m.getThread(a.id, threadId)).thread.canReply, false); assert.equal((await m.getThread(a.id, threadId)).thread.iBlocked, false, "the blocked member is not told who blocked");
    assert.equal((await m.openWith(a.id, pb.handle)).canMessage, false);
    assert.equal((await m.searchMembers(a.id, pb.handle.slice(0, 6))).items.some((x) => x.handle === pb.handle), false, "blocked pairs do not find each other in the member search");
    await m.setBlocked(a.id, pb.handle, false); // the blocked member cannot lift someone else's block
    await assert.rejects(() => m.sendMessage(a.id, threadId, { body: "unblocked myself?" }), { status: 403 });
    assert.deepEqual((await m.listBlocked(b.id)).items.map((x) => x.handle), [pa.handle]);
    await m.setBlocked(b.id, pa.handle, false);
    assert.equal((await m.sendMessage(a.id, threadId, { body: "thanks" })).message.body, "thanks");

    // Unverified, disabled and paused members
    const unverified = await mk(4, { emailVerifiedAt: null });
    await assert.rejects(() => m.startThread(unverified.id, { handle: pa.handle, body: "hi" }), { status: 403 });
    await db.forumProfile.update({ where: { id: pc.id }, data: { status: "SUSPENDED", suspendedUntil: null } });
    await assert.rejects(() => m.startThread(c.id, { handle: pb.handle, body: "hi" }), { status: 403 });
    assert.ok(Array.isArray((await m.listThreads(c.id)).items), "a paused member can still read");

    // Connection limits and cleanup
    const extra = Array.from({ length: bus.MAX_CONNECTIONS_PER_MEMBER }, () => bus.subscribe(pc.id, () => {}));
    assert.equal(extra.filter(Boolean).length, bus.MAX_CONNECTIONS_PER_MEMBER - 1, "one was already open; the limit holds");
    extra.forEach((off) => off?.()); offA!(); offB!(); offC!(); offSecond!();
    assert.equal(bus.connectionCount(pa.id) + bus.connectionCount(pb.id) + bus.connectionCount(pc.id), 0, "closed connections are forgotten");
    const quiet = got.b.length; await m.sendMessage(a.id, threadId, { body: "nobody is connected" });
    assert.equal(got.b.length, quiet); assert.equal((await m.getThread(b.id, threadId)).messages.at(-1)?.body, "nobody is connected", "missed live events are recovered from the database");

    // Messaging switched off: every entry point answers "not found"
    process.env.MESSAGES_ENABLED = "false";
    await assert.rejects(() => m.listThreads(a.id), { status: 404 }); await assert.rejects(() => m.sendMessage(a.id, threadId, { body: "x" }), { status: 404 });
    process.env.MESSAGES_ENABLED = "true";

    // Native app tokens: bearer requests need no Origin header; cookie requests still do; bad, revoked and expired tokens are refused
    const issued = await tokens.issueAppToken(a.id, "Test phone");
    assert.match(issued.token, /^mdt_/); assert.equal(await db.customerAppToken.count({ where: { tokenHash: issued.token } }), 0, "the raw token is not stored");
    const call = (headers: Record<string, string>, method = "POST") => http.customerApi(new Request("http://localhost:4123/api/v1/messages/threads", { method, headers }), async (id) => http.customerJson({ id }));
    const ok = await call({ authorization: `Bearer ${issued.token}` });
    assert.equal(ok.status, 200); assert.equal((await ok.json()).id, a.id);
    assert.equal((await call({ authorization: "Bearer mdt_wrong" })).status, 401);
    assert.equal((await call({ authorization: `Bearer ${issued.token}x` })).status, 401);
    assert.equal((await call({})).status, 403, "a write without a token still needs a verified same-site origin");
    // Live connection over HTTP (Server-Sent Events): authorized by the token, refused without it, delivers a stored message, cleans up on disconnect
    const streamRoute = await import("../src/app/api/v1/messages/stream/route");
    const sendRoute = await import("../src/app/api/v1/messages/threads/[id]/messages/route");
    assert.equal((await streamRoute.GET(new Request("http://localhost:4123/api/v1/messages/stream"))).status, 401, "no session, no stream");
    assert.equal((await streamRoute.GET(new Request("http://localhost:4123/api/v1/messages/stream", { headers: { authorization: "Bearer mdt_nope" } }))).status, 401);
    const bToken = await tokens.issueAppToken(b.id, "Second phone");
    const abort = new AbortController();
    const live = await streamRoute.GET(new Request("http://localhost:4123/api/v1/messages/stream", { headers: { authorization: `Bearer ${bToken.token}` }, signal: abort.signal }));
    assert.equal(live.status, 200); assert.match(live.headers.get("content-type") ?? "", /event-stream/);
    const reader = live.body!.getReader(), decoder = new TextDecoder();
    const next = async () => decoder.decode((await reader.read()).value);
    assert.match(await next(), /event: ready/);
    assert.equal(bus.connectionCount(pb.id), 1);
    const posted = await sendRoute.POST(new Request(`http://localhost:4123/api/v1/messages/threads/${threadId}/messages`, { method: "POST", headers: { authorization: `Bearer ${issued.token}`, "content-type": "application/json" }, body: JSON.stringify({ body: "over the wire", clientId: "wire-0001" }) }), { params: Promise.resolve({ id: threadId }) });
    assert.equal(posted.status, 201, "a native client can write with no Origin header");
    const frame = await next();
    assert.match(frame, /event: message/); assert.match(frame, /over the wire/); assert.ok(!frame.includes("@example.com"));
    await db.forumProfile.update({ where: { id: pc.id }, data: { status: "ACTIVE" } });
    const stranger = await sendRoute.POST(new Request(`http://localhost:4123/api/v1/messages/threads/${threadId}/messages`, { method: "POST", headers: { authorization: `Bearer ${(await tokens.issueAppToken(c.id)).token}`, "content-type": "application/json" }, body: JSON.stringify({ body: "intruder" }) }), { params: Promise.resolve({ id: threadId }) });
    assert.equal(stranger.status, 404, "changing the id in the address does not open someone else's conversation");
    abort.abort(); await new Promise((r) => setTimeout(r, 20));
    assert.equal(bus.connectionCount(pb.id), 0, "the connection is forgotten when the device disconnects");
    await db.customerAppToken.updateMany({ where: { customerId: a.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await call({ authorization: `Bearer ${issued.token}` })).status, 401, "expired");
    const second = await tokens.issueAppToken(a.id); await tokens.revokeAppToken(second.token);
    assert.equal((await call({ authorization: `Bearer ${second.token}` })).status, 401, "signed out");
    const third = await tokens.issueAppToken(b.id); await db.customer.update({ where: { id: b.id }, data: { disabledAt: new Date() } });
    assert.equal((await call({ authorization: `Bearer ${third.token}` })).status, 401, "disabled account");
  } finally {
    await getDatabase().customerAppToken.deleteMany({ where: { customer: { email: { startsWith: "zzdm-" } } } }).catch(() => {});
    await wipe();
  }
});
