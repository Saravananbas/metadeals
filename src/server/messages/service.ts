import "server-only";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/server/db/client";
import { logger } from "@/server/logging/logger";
import { CustomerError, limitCustomerRequests } from "@/server/customer/service";
import { assertActiveCustomer } from "@/server/customer/session";
import { isDefaultHandle } from "@/server/customer/identity";
import { ensureProfile } from "@/server/community/service";
import { newAccountHours, withRetry } from "@/server/community/config";
import { cleanText, findUrls, REPORT_CATEGORIES } from "@/features/community/validation";

export const messagesEnabled = () => process.env.MESSAGES_ENABLED === "true";
const writesOff = () => process.env.MESSAGES_WRITES_DISABLED === "true";
export function assertMessagesEnabled() { if (!messagesEnabled()) throw new CustomerError("Not found.", 404); }

const MAX_BODY = 2000;
const body = z.string().transform(cleanText).pipe(z.string().min(1, "Write a message first.").max(MAX_BODY, "That message is too long."));
const startSchema = z.object({ handle: z.string().trim().toLowerCase().min(3).max(30), body }).strict();
const sendSchema = z.object({ body }).strict();
const respondSchema = z.object({ action: z.enum(["accept", "decline"]) }).strict();
const reportSchema = z.object({ category: z.enum(REPORT_CATEGORIES), details: z.string().transform(cleanText).pipe(z.string().max(500)).nullable().optional() }).strict();

const pair = (a: string, b: string) => (a < b ? { low: a, high: b } : { low: b, high: a });
const avatarUrl = (handle: string, key: string | null) => (key ? `/api/v1/avatars/${handle}` : null);

/** The signed-in member as a messaging participant: verified, active, not suspended, and with a user name chosen. */
async function sender(customerId: string, forWrite: boolean) {
  assertMessagesEnabled();
  if (forWrite && writesOff()) throw new CustomerError("Messages are read-only right now. Please try again later.", 503);
  const customer = await assertActiveCustomer(customerId);
  const profile = await ensureProfile(customer.id);
  if (forWrite) {
    if (profile.status === "SUSPENDED" && (!profile.suspendedUntil || profile.suspendedUntil > new Date())) throw new CustomerError("Your messaging is paused.", 403);
    if (isDefaultHandle(profile.handle)) throw new CustomerError("Choose a user name before you send messages.", 403);
  }
  const row = await getDatabase().customer.findUniqueOrThrow({ where: { id: customer.id }, select: { createdAt: true } });
  return { profile, accountAgeHours: (Date.now() - row.createdAt.getTime()) / 3_600_000 };
}

const isBlocked = async (a: string, b: string) =>
  Boolean(await getDatabase().dmBlock.findFirst({ where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] }, select: { id: true } }));

function assertLinkPolicy(text: string, accountAgeHours: number) {
  const links = findUrls(text).length;
  if (links > 2) throw new CustomerError("Use at most 2 links in a message.", 400);
  if (links && accountAgeHours < newAccountHours()) throw new CustomerError("New accounts cannot send links yet. Please try again after your account is a day old.", 403);
}

type ThreadRow = Prisma.DmThreadGetPayload<{ include: { profileLow: { select: { id: true; handle: true; avatarKey: true } }; profileHigh: { select: { id: true; handle: true; avatarKey: true } } } }>;
const threadInclude = { profileLow: { select: { id: true, handle: true, avatarKey: true } }, profileHigh: { select: { id: true, handle: true, avatarKey: true } } } as const;

function view(thread: ThreadRow, me: string) {
  const mine = thread.profileLowId === me ? thread.profileLow : thread.profileHigh;
  const other = thread.profileLowId === me ? thread.profileHigh : thread.profileLow;
  const readAt = mine.id === thread.profileLowId ? thread.lowReadAt : thread.highReadAt;
  return {
    id: thread.id, status: thread.status, lastMessageAt: thread.lastMessageAt.toISOString(),
    other: { handle: other.handle, avatarUrl: avatarUrl(other.handle, other.avatarKey) },
    isRequestForMe: thread.status === "REQUESTED" && thread.requestedById !== me,
    iRequested: thread.requestedById === me,
    readAt,
  };
}

async function loadThread(threadId: string, me: string) {
  // Only the two participants can ever see a thread: anyone else gets "not found".
  const thread = await getDatabase().dmThread.findFirst({ where: { id: threadId, OR: [{ profileLowId: me }, { profileHighId: me }] }, include: threadInclude });
  if (!thread) throw new CustomerError("Conversation not found.", 404);
  return thread;
}

export async function startThread(customerId: string, raw: unknown) {
  const { profile, accountAgeHours } = await sender(customerId, true);
  const input = startSchema.parse(raw);
  assertLinkPolicy(input.body, accountAgeHours);
  const db = getDatabase();
  const target = await db.forumProfile.findUnique({ where: { handle: input.handle }, select: { id: true, status: true } });
  if (!target) throw new CustomerError("Member not found.", 404);
  if (target.id === profile.id) throw new CustomerError("You cannot message yourself.", 400);
  if (await isBlocked(profile.id, target.id)) throw new CustomerError("You cannot message this member.", 403);
  const { low, high } = pair(profile.id, target.id);
  const existing = await db.dmThread.findUnique({ where: { profileLowId_profileHighId: { profileLowId: low, profileHighId: high } }, select: { id: true } });
  if (existing) return sendMessage(customerId, existing.id, { body: input.body });
  await limitCustomerRequests(`dm-start:${profile.id}`, 10, 86_400);
  try {
    const thread = await db.dmThread.create({
      data: { profileLowId: low, profileHighId: high, requestedById: profile.id, status: "REQUESTED", lowReadAt: profile.id === low ? new Date() : null, highReadAt: profile.id === high ? new Date() : null, messages: { create: { senderId: profile.id, body: input.body } } },
      include: threadInclude,
    });
    logger.info({ event: "message.thread.requested" }, "message request sent");
    return { thread: view(thread, profile.id) };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const again = await db.dmThread.findUniqueOrThrow({ where: { profileLowId_profileHighId: { profileLowId: low, profileHighId: high } }, select: { id: true } });
      return sendMessage(customerId, again.id, { body: input.body });
    }
    throw error;
  }
}

export async function sendMessage(customerId: string, threadId: string, raw: unknown) {
  const { profile, accountAgeHours } = await sender(customerId, true);
  const input = sendSchema.parse(raw);
  assertLinkPolicy(input.body, accountAgeHours);
  await limitCustomerRequests(`dm-send:${profile.id}`, 60, 3600);
  const db = getDatabase();
  const thread = await loadThread(threadId, profile.id);
  const otherId = thread.profileLowId === profile.id ? thread.profileHighId : thread.profileLowId;
  if (await isBlocked(profile.id, otherId)) throw new CustomerError("You cannot message this member.", 403);
  const iRequested = thread.requestedById === profile.id;
  if (thread.status === "DECLINED" && iRequested) throw new CustomerError("This member is not accepting messages from you.", 403);
  if (thread.status === "REQUESTED" && iRequested) {
    const already = await db.dmMessage.count({ where: { threadId, senderId: profile.id } });
    if (already >= 1) throw new CustomerError("Wait for them to accept your request before sending more.", 409);
  }
  // Replying to a request (or to a thread you declined) opens the conversation.
  const nextStatus = !iRequested && thread.status !== "ACCEPTED" ? "ACCEPTED" : thread.status;
  const now = new Date();
  const message = await withRetry(() => db.$transaction(async (tx) => {
    const created = await tx.dmMessage.create({ data: { threadId, senderId: profile.id, body: input.body }, select: { id: true, body: true, createdAt: true } });
    await tx.dmThread.update({ where: { id: threadId }, data: { lastMessageAt: now, status: nextStatus, ...(thread.profileLowId === profile.id ? { lowReadAt: now } : { highReadAt: now }) } });
    return created;
  }));
  return { thread: view({ ...thread, status: nextStatus, lastMessageAt: now }, profile.id), message: { id: message.id, mine: true, body: message.body, createdAt: message.createdAt.toISOString() } };
}

export async function respondToRequest(customerId: string, threadId: string, raw: unknown) {
  const { profile } = await sender(customerId, true);
  const { action } = respondSchema.parse(raw);
  const thread = await loadThread(threadId, profile.id);
  if (thread.requestedById === profile.id) throw new CustomerError("Only the person who received the request can answer it.", 403);
  const changed = await getDatabase().dmThread.updateMany({ where: { id: threadId, status: "REQUESTED" }, data: { status: action === "accept" ? "ACCEPTED" : "DECLINED" } });
  if (changed.count !== 1) throw new CustomerError("This request was already answered.", 409);
  return { status: action === "accept" ? "ACCEPTED" : "DECLINED" };
}

export async function listThreads(customerId: string) {
  const { profile } = await sender(customerId, false);
  const db = getDatabase();
  const threads = await db.dmThread.findMany({ where: { OR: [{ profileLowId: profile.id }, { profileHighId: profile.id }] }, orderBy: { lastMessageAt: "desc" }, take: 50, include: threadInclude });
  const lasts = threads.length ? await db.dmMessage.findMany({ where: { threadId: { in: threads.map((t) => t.id) } }, orderBy: { createdAt: "desc" }, distinct: ["threadId"], select: { threadId: true, body: true, senderId: true, createdAt: true } }) : [];
  const lastOf = new Map(lasts.map((m) => [m.threadId, m]));
  const blocks = await db.dmBlock.findMany({ where: { blockerId: profile.id }, select: { blockedId: true } });
  const blockedByMe = new Set(blocks.map((b) => b.blockedId));
  const items = threads.map((t) => {
    const v = view(t, profile.id), last = lastOf.get(t.id);
    const otherId = t.profileLowId === profile.id ? t.profileHighId : t.profileLowId;
    const unread = Boolean(last && last.senderId !== profile.id && (!v.readAt || last.createdAt > v.readAt));
    return { ...v, readAt: undefined, unread, blockedByMe: blockedByMe.has(otherId), last: last ? { excerpt: last.body.slice(0, 90), mine: last.senderId === profile.id } : null };
  });
  return { items, unread: items.filter((i) => i.unread).length };
}

export async function getThread(customerId: string, threadId: string, before?: string) {
  const { profile } = await sender(customerId, false);
  const db = getDatabase();
  const thread = await loadThread(threadId, profile.id);
  const cutoff = before ? new Date(before) : undefined;
  const rows = await db.dmMessage.findMany({ where: { threadId, ...(cutoff && !Number.isNaN(cutoff.getTime()) ? { createdAt: { lt: cutoff } } : {}) }, orderBy: { createdAt: "desc" }, take: 51, select: { id: true, senderId: true, body: true, deleted: true, createdAt: true } });
  const page = rows.slice(0, 50).reverse();
  const now = new Date();
  await db.dmThread.update({ where: { id: threadId }, data: thread.profileLowId === profile.id ? { lowReadAt: now } : { highReadAt: now } });
  const otherId = thread.profileLowId === profile.id ? thread.profileHighId : thread.profileLowId;
  const v = view(thread, profile.id);
  const iBlocked = Boolean(await db.dmBlock.findFirst({ where: { blockerId: profile.id, blockedId: otherId }, select: { id: true } }));
  const canReply = !(await isBlocked(profile.id, otherId)) && !(v.status === "DECLINED" && v.iRequested) && !(v.status === "REQUESTED" && v.iRequested && page.some((m) => m.senderId === profile.id));
  return {
    thread: { ...v, readAt: undefined, iBlocked, canReply },
    messages: page.map((m) => ({ id: m.id, mine: m.senderId === profile.id, body: m.deleted ? null : m.body, createdAt: m.createdAt.toISOString() })),
    hasMore: rows.length > 50,
  };
}

export async function setBlocked(customerId: string, handle: string, blocked: boolean) {
  const { profile } = await sender(customerId, true);
  const target = await getDatabase().forumProfile.findUnique({ where: { handle: handle.toLowerCase() }, select: { id: true } });
  if (!target || target.id === profile.id) throw new CustomerError("Member not found.", 404);
  if (blocked) {
    try { await getDatabase().dmBlock.create({ data: { blockerId: profile.id, blockedId: target.id } }); }
    catch (error) { if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error; }
  } else {
    await getDatabase().dmBlock.deleteMany({ where: { blockerId: profile.id, blockedId: target.id } });
  }
  return { blocked };
}

export async function reportMessage(customerId: string, messageId: string, raw: unknown) {
  const { profile } = await sender(customerId, true);
  const input = reportSchema.parse(raw);
  await limitCustomerRequests(`dm-report:${profile.id}`, 10, 3600);
  const db = getDatabase();
  const message = await db.dmMessage.findFirst({ where: { id: messageId, deleted: false, senderId: { not: profile.id }, thread: { OR: [{ profileLowId: profile.id }, { profileHighId: profile.id }] } }, select: { id: true, threadId: true, senderId: true, body: true } });
  if (!message) throw new CustomerError("Message not found.", 404);
  try {
    await db.dmReport.create({ data: { reporterId: profile.id, reportedProfileId: message.senderId, threadId: message.threadId, messageId: message.id, category: input.category, details: input.details || null, snapshot: message.body.slice(0, 2000) } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { reported: true, duplicate: true };
    throw error;
  }
  logger.info({ event: "message.report.created", category: input.category }, "message reported");
  return { reported: true, duplicate: false };
}

export async function unreadCount(customerId: string) {
  return (await listThreads(customerId)).unread;
}
