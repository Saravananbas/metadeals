import "server-only";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/server/db/client";
import { logger } from "@/server/logging/logger";
import { CustomerError, limitCustomerRequests } from "@/server/customer/service";
import { assertActiveCustomer } from "@/server/customer/session";
import { ensureProfile } from "@/server/community/service";
import { newAccountHours, withRetry } from "@/server/community/config";
import { cleanText, findUrls, REPORT_CATEGORIES } from "@/features/community/validation";
import { publicWhere } from "@/server/deals/repository";
import { listingSchema } from "@/features/deals/validation";
import { usesMariaDb } from "@/server/community/like-search";
import { connectionCount, publish } from "./bus";
import { pushToCustomer } from "@/server/push/dispatch";

/**
 * Private one-to-one messages between members. Any signed-in, verified member can write to any other member (no request step);
 * the recipient can block, mute, report, archive or remove the conversation from their own inbox.
 * Every rule is enforced here, on the server: the two participants are the only people who can ever read a conversation.
 */
export const messagesEnabled = () => process.env.MESSAGES_ENABLED === "true";
const writesOff = () => process.env.MESSAGES_WRITES_DISABLED === "true";
export function assertMessagesEnabled() { if (!messagesEnabled()) throw new CustomerError("Not found.", 404); }

export const MAX_BODY = 2000;
const ONLINE_MS = 90_000;
const body = z.string().transform(cleanText).pipe(z.string().max(MAX_BODY, "That message is too long."));
const share = z.object({ kind: z.enum(["DEAL", "DISCUSSION"]), id: z.string().trim().min(1).max(191) }).strict();
const sendFields = { body: body.optional(), share: share.optional(), clientId: z.string().regex(/^[A-Za-z0-9_-]{8,40}$/).optional() };
const hasContent = (v: { body?: string; share?: unknown }) => Boolean(v.body?.length || v.share);
const sendSchema = z.object(sendFields).strict().refine(hasContent, "Write a message first.");
const startSchema = z.object({ handle: z.string().trim().toLowerCase().min(3).max(30), ...sendFields }).strict().refine(hasContent, "Write a message first.");
const reportSchema = z.object({ category: z.enum(REPORT_CATEGORIES), details: z.string().transform(cleanText).pipe(z.string().max(500)).nullable().optional() }).strict();
const settingsSchema = z.object({ muted: z.boolean().optional(), archived: z.boolean().optional() }).strict();

type Side = "low" | "high";
const pair = (a: string, b: string) => (a < b ? { low: a, high: b } : { low: b, high: a });
const memberSelect = { id: true, handle: true, displayName: true, avatarKey: true, lastSeenAt: true, verifiedAt: true } as const;
const threadInclude = { profileLow: { select: memberSelect }, profileHigh: { select: memberSelect } } as const;
type Member = Prisma.ForumProfileGetPayload<{ select: typeof memberSelect }>;
type ThreadRow = Prisma.DmThreadGetPayload<{ include: typeof threadInclude }>;
type MessageRow = { id: string; senderId: string; body: string; kind: string; refId: string | null; clientId: string | null; deleted: boolean; createdAt: Date };
const messageSelect = { id: true, senderId: true, body: true, kind: true, refId: true, clientId: true, deleted: true, createdAt: true } as const;

const sideOf = (t: { profileLowId: string }, me: string): Side => (t.profileLowId === me ? "low" : "high");
const flip = (s: Side): Side => (s === "low" ? "high" : "low");
const stamp = (t: ThreadRow, s: Side, field: "ReadAt" | "DeliveredAt" | "MutedAt" | "ArchivedAt" | "ClearedAt") => t[`${s}${field}`] as Date | null;
const later = (a: Date | null, b: Date | null) => (!a ? b : !b ? a : a > b ? a : b);
const iso = (d: Date | null) => d?.toISOString() ?? null;

/** What one member may see of another in messaging: public name and picture, plus whether they are connected right now. */
export function memberCard(p: Member) {
  return { handle: p.handle, displayName: p.displayName, verified: Boolean(p.verifiedAt), avatarUrl: p.avatarKey ? `/api/v1/avatars/${p.handle}` : null, online: Boolean(p.lastSeenAt && Date.now() - p.lastSeenAt.getTime() < ONLINE_MS) };
}

/** The signed-in member as a messaging participant: verified and active; for writes also not paused by moderation. */
async function participant(customerId: string, forWrite: boolean) {
  assertMessagesEnabled();
  if (forWrite && writesOff()) throw new CustomerError("Messages are read-only right now. Please try again later.", 503);
  const customer = await assertActiveCustomer(customerId);
  const profile = await ensureProfile(customer.id);
  if (forWrite && profile.status === "SUSPENDED" && (!profile.suspendedUntil || profile.suspendedUntil > new Date())) throw new CustomerError("Your messaging is paused.", 403);
  return profile;
}
/** For the live connection: the member's messaging id, or an error when they may not use messages. */
export async function participantId(customerId: string) { return (await participant(customerId, false)).id; }

const isBlocked = async (a: string, b: string) =>
  Boolean(await getDatabase().dmBlock.findFirst({ where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] }, select: { id: true } }));

async function assertLinkPolicy(text: string, customerId: string) {
  const links = findUrls(text).length;
  if (!links) return;
  if (links > 2) throw new CustomerError("Use at most 2 links in a message.", 400);
  const { createdAt } = await getDatabase().customer.findUniqueOrThrow({ where: { id: customerId }, select: { createdAt: true } });
  if ((Date.now() - createdAt.getTime()) / 3_600_000 < newAccountHours()) throw new CustomerError("New accounts cannot send links yet. Please try again after your account is a day old.", 403);
}

async function loadThread(threadId: string, me: string) {
  // Only the two participants can ever see a conversation: anyone else gets "not found", never "forbidden".
  const thread = await getDatabase().dmThread.findFirst({ where: { id: threadId, OR: [{ profileLowId: me }, { profileHighId: me }] }, include: threadInclude });
  if (!thread) throw new CustomerError("Conversation not found.", 404);
  return thread;
}

// ---------- shared deals and discussions ----------
export type ShareCard =
  | { kind: "DEAL"; id: string; title: string; imageUrl: string; priceMinor: number; mrpMinor: number; discountPercent: number; merchant: string; url: string }
  | { kind: "DISCUSSION"; id: string; title: string; author: string; excerpt: string; url: string; shortUrl: string }
  | { kind: "DEAL" | "DISCUSSION"; unavailable: true };

/** Cards are built from the live record each time, so a deal that ended or a removed discussion simply shows as unavailable. */
async function shareCards(rows: { kind: string; refId: string | null }[]) {
  const db = getDatabase();
  const ids = (kind: string) => [...new Set(rows.filter((r) => r.kind === kind && r.refId).map((r) => r.refId as string))];
  const dealIds = ids("DEAL"), postIds = ids("DISCUSSION");
  const [deals, posts] = await Promise.all([
    dealIds.length ? db.deal.findMany({ where: { AND: [publicWhere(listingSchema.parse({})), { status: "PUBLISHED", id: { in: dealIds } }] }, select: { id: true, slug: true, title: true, mediaId: true, priceMinor: true, mrpMinor: true, merchant: { select: { name: true } } } }) : [],
    postIds.length ? db.forumPost.findMany({ where: { id: { in: postIds }, status: "PUBLISHED", community: { isActive: true } }, select: { id: true, slug: true, title: true, body: true, author: { select: { handle: true } } } }) : [],
  ]);
  const cards = new Map<string, ShareCard>();
  for (const d of deals) cards.set(`DEAL:${d.id}`, { kind: "DEAL", id: d.id, title: d.title, imageUrl: `/api/v1/media/${d.mediaId}`, priceMinor: d.priceMinor, mrpMinor: d.mrpMinor, discountPercent: d.mrpMinor > d.priceMinor ? Math.round(((d.mrpMinor - d.priceMinor) / d.mrpMinor) * 100) : 0, merchant: d.merchant.name, url: `/deal/${d.slug}` });
  for (const p of posts) cards.set(`DISCUSSION:${p.id}`, { kind: "DISCUSSION", id: p.id, title: p.title, author: p.author.handle, excerpt: p.body.slice(0, 140), url: `/community/post/${p.slug}`, shortUrl: `/p/${p.slug.slice(-6)}` });
  return (row: { kind: string; refId: string | null }): ShareCard | null =>
    row.kind === "TEXT" ? null : cards.get(`${row.kind}:${row.refId}`) ?? { kind: row.kind as "DEAL" | "DISCUSSION", unavailable: true };
}

async function resolveShare(input: z.infer<typeof share>) {
  const db = getDatabase();
  const found = input.kind === "DEAL"
    ? await db.deal.findFirst({ where: { AND: [publicWhere(listingSchema.parse({})), { status: "PUBLISHED", OR: [{ id: input.id }, { slug: input.id }] }] }, select: { id: true } })
    : await db.forumPost.findFirst({ where: { OR: [{ id: input.id }, { slug: input.id }], status: "PUBLISHED", community: { isActive: true } }, select: { id: true } });
  if (!found) throw new CustomerError(input.kind === "DEAL" ? "That deal is not available to share." : "That discussion is not available to share.", 404);
  return found.id;
}

function messageDto(m: MessageRow, me: string, card: ShareCard | null, otherReadAt: Date | null, otherDeliveredAt: Date | null) {
  const mine = m.senderId === me;
  return {
    id: m.id, mine, kind: m.kind, body: m.deleted ? null : m.body, share: m.deleted ? null : card, createdAt: m.createdAt.toISOString(),
    ...(mine ? { clientId: m.clientId, status: otherReadAt && m.createdAt <= otherReadAt ? "read" : otherDeliveredAt && m.createdAt <= otherDeliveredAt ? "delivered" : "sent" } : {}),
  };
}
const excerptOf = (m: { kind: string; body: string; deleted?: boolean }) => (m.deleted ? "Message removed" : m.body ? m.body.slice(0, 90) : m.kind === "DEAL" ? "Shared a deal" : "Shared a discussion");

// ---------- sending ----------
/** Sends to a member by user name (creating the conversation on the first message) or into an existing conversation. */
export async function startThread(customerId: string, raw: unknown) {
  const profile = await participant(customerId, true);
  const { handle, ...message } = startSchema.parse(raw);
  const db = getDatabase();
  const target = await db.forumProfile.findUnique({ where: { handle }, select: { id: true } });
  if (!target) throw new CustomerError("Member not found.", 404);
  if (target.id === profile.id) throw new CustomerError("You cannot message yourself.", 400);
  if (await isBlocked(profile.id, target.id)) throw new CustomerError("You cannot message this member.", 403);
  const { low, high } = pair(profile.id, target.id);
  const key = { profileLowId_profileHighId: { profileLowId: low, profileHighId: high } };
  let thread = await db.dmThread.findUnique({ where: key, select: { id: true } });
  if (!thread) {
    await limitCustomerRequests(`dm-start:${profile.id}`, 20, 86_400);
    try {
      thread = await db.dmThread.create({ data: { profileLowId: low, profileHighId: high, requestedById: profile.id, status: "ACCEPTED" }, select: { id: true } });
    } catch (error) {
      // Both members wrote first at the same moment: the pair is unique, so use the conversation that won.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
      thread = await db.dmThread.findUniqueOrThrow({ where: key, select: { id: true } });
    }
  }
  return sendMessage(customerId, thread.id, message);
}

export async function sendMessage(customerId: string, threadId: string, raw: unknown) {
  const profile = await participant(customerId, true);
  const input = sendSchema.parse(raw);
  const db = getDatabase();
  const thread = await loadThread(threadId, profile.id);
  const mySide = sideOf(thread, profile.id), otherSide = flip(mySide);
  const otherMember = mySide === "low" ? thread.profileHigh : thread.profileLow, me = mySide === "low" ? thread.profileLow : thread.profileHigh;
  const dto = async (m: MessageRow, viewer: string) => messageDto(m, viewer, (await shareCards([m]))(m), stamp(thread, otherSide, "ReadAt"), stamp(thread, otherSide, "DeliveredAt"));

  // A retried send (same device id) returns the message stored the first time instead of adding a second copy.
  if (input.clientId) {
    const again = await db.dmMessage.findUnique({ where: { senderId_clientId: { senderId: profile.id, clientId: input.clientId } }, select: { ...messageSelect, threadId: true } });
    if (again) { if (again.threadId !== threadId) throw new CustomerError("Conversation not found.", 404); return { threadId, message: await dto(again, profile.id), duplicate: true }; }
  }
  if (await isBlocked(profile.id, otherMember.id)) throw new CustomerError("You cannot message this member.", 403);
  const text = input.body ?? "";
  await assertLinkPolicy(text, customerId);
  await limitCustomerRequests(`dm-send-min:${profile.id}`, 30, 60);
  await limitCustomerRequests(`dm-send:${profile.id}`, 400, 3600);
  const refId = input.share ? await resolveShare(input.share) : null;
  const kind = input.share?.kind ?? "TEXT";
  const now = new Date();
  const muted = Boolean(stamp(thread, otherSide, "MutedAt"));
  const seen = stamp(thread, mySide, "ReadAt");
  const caughtUp = !seen || seen < thread.lastMessageAt; // there were messages this member had not yet been marked as having read

  let created: MessageRow;
  try {
    created = await withRetry(() => db.$transaction(async (tx) => {
      const row = await tx.dmMessage.create({ data: { threadId, senderId: profile.id, body: text, kind, refId, clientId: input.clientId ?? null, createdAt: now }, select: messageSelect });
      // A new message brings the conversation back into both inboxes; the sender has, by definition, read up to here.
      await tx.dmThread.update({ where: { id: threadId }, data: { lastMessageAt: now, status: "ACCEPTED", [`${mySide}ReadAt`]: now, [`${mySide}DeliveredAt`]: now, [`${mySide}ArchivedAt`]: null, [`${otherSide}ArchivedAt`]: null } });
      if (caughtUp) await tx.forumNotification.updateMany({ where: { recipientId: profile.id, type: "MESSAGE", postId: threadId, readAt: null }, data: { readAt: now } });
      if (!muted) {
        // One unread notice per conversation: more messages refresh it instead of piling up.
        const title = excerptOf(row).slice(0, 200);
        const open = await tx.forumNotification.findFirst({ where: { recipientId: otherMember.id, type: "MESSAGE", postId: threadId, readAt: null }, select: { id: true } });
        if (open) await tx.forumNotification.update({ where: { id: open.id }, data: { actorId: profile.id, postTitle: title, createdAt: now } });
        else await tx.forumNotification.create({ data: { recipientId: otherMember.id, actorId: profile.id, type: "MESSAGE", postId: threadId, postSlug: threadId, postTitle: title } });
      }
      return row;
    }));
  } catch (error) {
    if (input.clientId && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const again = await db.dmMessage.findUniqueOrThrow({ where: { senderId_clientId: { senderId: profile.id, clientId: input.clientId } }, select: messageSelect });
      return { threadId, message: await dto(again, profile.id), duplicate: true };
    }
    throw error;
  }
  // Only now, with the message stored, are the live events sent.
  const mine = await dto(created, profile.id);
  // Replying means everything before it was received and seen, which was just stored above: the other member's ticks follow.
  if (caughtUp) publish(otherMember.id, "read", { threadId, at: now.toISOString(), by: "other" });
  publish(otherMember.id, "message", { threadId, muted, from: memberCard(me), message: await dto(created, otherMember.id) });
  publish(profile.id, "message", { threadId, from: memberCard(otherMember), message: mine });
  // Push alert only when the message was stored, the conversation is not muted, and the member has no open live connection on this server.
  if (!muted && connectionCount(otherMember.id) === 0) {
    void db.forumProfile.findUnique({ where: { id: otherMember.id }, select: { customerId: true } })
      .then((to) => to && pushToCustomer(to.customerId, { title: `New message from ${me.handle}`, body: "Open MetaDeals4U to read it.", data: { type: "message", threadId } }))
      .catch(() => {});
  }
  return { threadId, message: mine, duplicate: false };
}

// ---------- reading ----------
type ListQuery = { filter?: string | null; q?: string | null };
export async function listThreads(customerId: string, query: ListQuery = {}) {
  const profile = await participant(customerId, false);
  const me = profile.id, db = getDatabase();
  const threads = await db.dmThread.findMany({ where: { OR: [{ profileLowId: me }, { profileHighId: me }] }, orderBy: { lastMessageAt: "desc" }, take: 100, include: threadInclude });
  const lasts = threads.length ? await db.dmMessage.findMany({ where: { threadId: { in: threads.map((t) => t.id) } }, orderBy: { createdAt: "desc" }, distinct: ["threadId"], select: { ...messageSelect, threadId: true } }) : [];
  const lastOf = new Map(lasts.map((m) => [m.threadId, m]));
  const blockedByMe = new Set((await db.dmBlock.findMany({ where: { blockerId: me }, select: { blockedId: true } })).map((b) => b.blockedId));

  const rows = await Promise.all(threads.map(async (t) => {
    const mySide = sideOf(t, me), otherSide = flip(mySide), last = lastOf.get(t.id);
    const cleared = stamp(t, mySide, "ClearedAt");
    if (!last || (cleared && last.createdAt <= cleared)) return null; // empty, or removed from this member's inbox
    const since = later(stamp(t, mySide, "ReadAt"), cleared);
    const unread = last.senderId !== me && (!since || last.createdAt > since)
      ? await db.dmMessage.count({ where: { threadId: t.id, senderId: { not: me }, ...(since ? { createdAt: { gt: since } } : {}) } }) : 0;
    const otherMember = mySide === "low" ? t.profileHigh : t.profileLow;
    return {
      id: t.id, other: memberCard(otherMember), lastMessageAt: t.lastMessageAt.toISOString(), unread,
      muted: Boolean(stamp(t, mySide, "MutedAt")), archived: Boolean(stamp(t, mySide, "ArchivedAt")), blockedByMe: blockedByMe.has(otherMember.id),
      last: { excerpt: excerptOf(last), mine: last.senderId === me, kind: last.kind, createdAt: last.createdAt.toISOString(),
        ...(last.senderId === me ? { status: messageDto(last, me, null, stamp(t, otherSide, "ReadAt"), stamp(t, otherSide, "DeliveredAt")).status } : {}) },
    };
  }));
  const all = rows.filter((r): r is NonNullable<typeof r> => r !== null);
  const needle = query.q?.trim().toLowerCase().slice(0, 60);
  const inbox = all.filter((r) => !r.archived);
  const items = (query.filter === "archived" ? all.filter((r) => r.archived) : query.filter === "unread" ? inbox.filter((r) => r.unread > 0) : inbox)
    .filter((r) => !needle || r.other.handle.includes(needle) || (r.other.displayName ?? "").toLowerCase().includes(needle));
  return {
    items,
    // The badge counts unread messages in conversations that are not muted or archived.
    unread: inbox.filter((r) => !r.muted).reduce((sum, r) => sum + r.unread, 0),
    unreadConversations: inbox.filter((r) => r.unread > 0).length,
  };
}
export async function unreadCount(customerId: string) { return (await listThreads(customerId)).unread; }

export async function getThread(customerId: string, threadId: string, before?: string | null) {
  const profile = await participant(customerId, false);
  const me = profile.id, db = getDatabase();
  const thread = await loadThread(threadId, me);
  const mySide = sideOf(thread, me), otherSide = flip(mySide);
  const cleared = stamp(thread, mySide, "ClearedAt");
  const cutoff = before ? new Date(before) : null;
  const range = { ...(cleared ? { gt: cleared } : {}), ...(cutoff && !Number.isNaN(cutoff.getTime()) ? { lt: cutoff } : {}) };
  const rows = await db.dmMessage.findMany({ where: { threadId, ...(Object.keys(range).length ? { createdAt: range } : {}) }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51, select: messageSelect });
  const page = rows.slice(0, 50).reverse();
  const card = await shareCards(page);
  const otherMember = mySide === "low" ? thread.profileHigh : thread.profileLow;
  const [iBlocked, blockedEither] = await Promise.all([
    db.dmBlock.findFirst({ where: { blockerId: me, blockedId: otherMember.id }, select: { id: true } }).then(Boolean),
    isBlocked(me, otherMember.id),
  ]);
  const otherReadAt = stamp(thread, otherSide, "ReadAt"), otherDeliveredAt = stamp(thread, otherSide, "DeliveredAt");
  return {
    thread: {
      id: thread.id, other: memberCard(otherMember), muted: Boolean(stamp(thread, mySide, "MutedAt")), archived: Boolean(stamp(thread, mySide, "ArchivedAt")),
      iBlocked, canReply: !blockedEither, otherReadAt: iso(otherReadAt), otherDeliveredAt: iso(otherDeliveredAt),
    },
    messages: page.map((m) => messageDto(m, me, card(m), otherReadAt, otherDeliveredAt)),
    hasMore: rows.length > 50,
  };
}

/** Who the member is about to write to, and the conversation they already share (if any). Used by "Message" on a profile. */
export async function openWith(customerId: string, handle: string) {
  const profile = await participant(customerId, false);
  const db = getDatabase();
  const target = await db.forumProfile.findUnique({ where: { handle: handle.toLowerCase() }, select: memberSelect });
  if (!target || target.id === profile.id) throw new CustomerError("Member not found.", 404);
  const { low, high } = pair(profile.id, target.id);
  const [thread, iBlocked, blockedEither] = await Promise.all([
    db.dmThread.findUnique({ where: { profileLowId_profileHighId: { profileLowId: low, profileHighId: high } }, select: { id: true } }),
    db.dmBlock.findFirst({ where: { blockerId: profile.id, blockedId: target.id }, select: { id: true } }).then(Boolean),
    isBlocked(profile.id, target.id),
  ]);
  return { member: memberCard(target), threadId: thread?.id ?? null, iBlocked, canMessage: !blockedEither };
}

/** Members to start a conversation with, by the start of their user name or display name. Never returns email or account details. */
export async function searchMembers(customerId: string, q: string) {
  const profile = await participant(customerId, false);
  const text = cleanText(q).toLowerCase().slice(0, 30);
  if (text.length < 2) return { items: [] };
  const db = getDatabase();
  let ids: string[] | null = null;
  if (usesMariaDb()) {
    // Prisma's generated LIKE fails on the MariaDB host (collation mix), so the pattern is passed as one prepared value.
    const pattern = `${text.replace(/[\\%_]/g, "\\$&")}%`;
    const rows = await (db as unknown as { $queryRaw: <T>(q: Prisma.Sql) => Promise<T> }).$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM ForumProfile WHERE handle LIKE ${pattern} OR displayName LIKE ${pattern} LIMIT 20`);
    ids = rows.map((r) => r.id);
  }
  const found = await db.forumProfile.findMany({
    where: { customer: { disabledAt: null }, ...(ids ? { id: { in: ids.filter((id) => id !== profile.id) } } : { id: { not: profile.id }, OR: [{ handle: { startsWith: text } }, { displayName: { startsWith: text, mode: "insensitive" } }] }) },
    orderBy: { handle: "asc" }, take: 8, select: memberSelect,
  });
  const blocks = found.length ? await db.dmBlock.findMany({ where: { OR: [{ blockerId: profile.id, blockedId: { in: found.map((f) => f.id) } }, { blockedId: profile.id, blockerId: { in: found.map((f) => f.id) } }] }, select: { blockerId: true, blockedId: true } }) : [];
  const hidden = new Set(blocks.flatMap((b) => [b.blockerId, b.blockedId]));
  return { items: found.filter((f) => !hidden.has(f.id)).map(memberCard) };
}

// ---------- receipts, typing, presence ----------
/** Called by the recipient's device when the conversation is actually on screen (visible, focused tab). */
export async function markRead(customerId: string, threadId: string) {
  const profile = await participant(customerId, false);
  const thread = await loadThread(threadId, profile.id);
  const mySide = sideOf(thread, profile.id), now = new Date();
  const db = getDatabase();
  await db.$transaction([
    db.dmThread.update({ where: { id: threadId }, data: { [`${mySide}ReadAt`]: now, [`${mySide}DeliveredAt`]: now } }),
    db.forumNotification.updateMany({ where: { recipientId: profile.id, type: "MESSAGE", postId: threadId, readAt: null }, data: { readAt: now } }),
  ]);
  const otherId = mySide === "low" ? thread.profileHighId : thread.profileLowId;
  publish(otherId, "read", { threadId, at: now.toISOString(), by: "other" });
  publish(profile.id, "read", { threadId, at: now.toISOString(), by: "me" });
  return { readAt: now.toISOString() };
}

/** Called when the member's device has received their messages (on connecting and when a live message arrives). */
export async function markDelivered(customerId: string) {
  const profile = await participant(customerId, false);
  const me = profile.id, db = getDatabase(), now = new Date();
  const threads = await db.dmThread.findMany({ where: { OR: [{ profileLowId: me }, { profileHighId: me }] }, orderBy: { lastMessageAt: "desc" }, take: 100, select: { id: true, profileLowId: true, profileHighId: true, lastMessageAt: true, lowDeliveredAt: true, highDeliveredAt: true } });
  const pending = threads.filter((t) => { const seen = t.profileLowId === me ? t.lowDeliveredAt : t.highDeliveredAt; return !seen || seen < t.lastMessageAt; });
  for (const side of ["low", "high"] as const) {
    const ids = pending.filter((t) => sideOf(t, me) === side).map((t) => t.id);
    if (ids.length) await db.dmThread.updateMany({ where: { id: { in: ids } }, data: { [`${side}DeliveredAt`]: now } });
  }
  for (const t of pending) publish(t.profileLowId === me ? t.profileHighId : t.profileLowId, "delivered", { threadId: t.id, at: now.toISOString() });
  return { delivered: pending.length };
}

const lastTyping = new Map<string, number>();
export async function typing(customerId: string, threadId: string) {
  const profile = await participant(customerId, true);
  const key = `${profile.id}:${threadId}`, now = Date.now();
  if (now - (lastTyping.get(key) ?? 0) < 1500) return { ok: true }; // at most one signal every 1.5 seconds
  lastTyping.set(key, now);
  if (lastTyping.size > 5000) for (const [k, v] of lastTyping) if (now - v > 60_000) lastTyping.delete(k);
  const thread = await loadThread(threadId, profile.id);
  const otherId = thread.profileLowId === profile.id ? thread.profileHighId : thread.profileLowId;
  if (!(await isBlocked(profile.id, otherId))) publish(otherId, "typing", { threadId });
  return { ok: true };
}

/** Keeps "online" honest: it is only true while a live connection of that member is open. */
export async function touchPresence(profileId: string) {
  await getDatabase().forumProfile.update({ where: { id: profileId }, data: { lastSeenAt: new Date() } }).catch(() => {});
}

// ---------- mute, archive, remove, block, report ----------
export async function updateThread(customerId: string, threadId: string, raw: unknown) {
  const profile = await participant(customerId, false);
  const input = settingsSchema.parse(raw);
  const thread = await loadThread(threadId, profile.id);
  const s = sideOf(thread, profile.id), now = new Date();
  await getDatabase().dmThread.update({ where: { id: threadId }, data: { ...(input.muted === undefined ? {} : { [`${s}MutedAt`]: input.muted ? now : null }), ...(input.archived === undefined ? {} : { [`${s}ArchivedAt`]: input.archived ? now : null }) } });
  publish(profile.id, "thread", { threadId });
  return { muted: input.muted ?? Boolean(stamp(thread, s, "MutedAt")), archived: input.archived ?? Boolean(stamp(thread, s, "ArchivedAt")) };
}

/** Removes the conversation from this member's inbox only. Nothing is deleted: the other member keeps their history. */
export async function removeThread(customerId: string, threadId: string) {
  const profile = await participant(customerId, false);
  const thread = await loadThread(threadId, profile.id);
  const s = sideOf(thread, profile.id), now = new Date();
  const db = getDatabase();
  await db.$transaction([
    db.dmThread.update({ where: { id: threadId }, data: { [`${s}ClearedAt`]: now, [`${s}ReadAt`]: now, [`${s}ArchivedAt`]: null } }),
    db.forumNotification.updateMany({ where: { recipientId: profile.id, type: "MESSAGE", postId: threadId, readAt: null }, data: { readAt: now } }),
  ]);
  publish(profile.id, "thread", { threadId });
  return { removed: true };
}

export async function setBlocked(customerId: string, handle: string, blocked: boolean) {
  const profile = await participant(customerId, false);
  const db = getDatabase();
  const target = await db.forumProfile.findUnique({ where: { handle: handle.toLowerCase() }, select: { id: true } });
  if (!target || target.id === profile.id) throw new CustomerError("Member not found.", 404);
  if (blocked) {
    try { await db.dmBlock.create({ data: { blockerId: profile.id, blockedId: target.id } }); }
    catch (error) { if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error; }
  } else {
    await db.dmBlock.deleteMany({ where: { blockerId: profile.id, blockedId: target.id } });
  }
  if (blocked) await db.forumMemberFollow.deleteMany({ where: { OR: [{ followerId: profile.id, followedId: target.id }, { followerId: target.id, followedId: profile.id }] } });
  const { low, high } = pair(profile.id, target.id);
  const thread = await db.dmThread.findUnique({ where: { profileLowId_profileHighId: { profileLowId: low, profileHighId: high } }, select: { id: true } });
  if (thread) { publish(profile.id, "thread", { threadId: thread.id }); publish(target.id, "thread", { threadId: thread.id }); }
  return { blocked };
}

export async function listBlocked(customerId: string) {
  const profile = await participant(customerId, false);
  const rows = await getDatabase().dmBlock.findMany({ where: { blockerId: profile.id }, orderBy: { createdAt: "desc" }, take: 100, select: { blocked: { select: memberSelect } } });
  return { items: rows.map((r) => ({ handle: r.blocked.handle, displayName: r.blocked.displayName, avatarUrl: memberCard(r.blocked).avatarUrl })) };
}

/** Staff never browse conversations: they see one message only when a participant reports it (its text is copied at that moment). */
export async function reportMessage(customerId: string, messageId: string, raw: unknown) {
  const profile = await participant(customerId, false);
  const input = reportSchema.parse(raw);
  await limitCustomerRequests(`dm-report:${profile.id}`, 10, 3600);
  const db = getDatabase();
  const message = await db.dmMessage.findFirst({ where: { id: messageId, deleted: false, senderId: { not: profile.id }, thread: { OR: [{ profileLowId: profile.id }, { profileHighId: profile.id }] } }, select: { id: true, threadId: true, senderId: true, body: true, kind: true } });
  if (!message) throw new CustomerError("Message not found.", 404);
  try {
    await db.dmReport.create({ data: { reporterId: profile.id, reportedProfileId: message.senderId, threadId: message.threadId, messageId: message.id, category: input.category, details: input.details || null, snapshot: (message.body || excerptOf(message)).slice(0, 2000) } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { reported: true, duplicate: true };
    throw error;
  }
  logger.info({ event: "message.report.created", category: input.category }, "message reported");
  return { reported: true, duplicate: false };
}
