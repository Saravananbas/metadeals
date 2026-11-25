import "server-only";
import { z } from "zod";
import { getDatabase } from "@/server/db/client";
import { CustomerError, limitCustomerRequests } from "@/server/customer/service";
import { assertActiveCustomer } from "@/server/customer/session";
import { publicWhere } from "./repository";
import { listingSchema } from "@/features/deals/validation";
import { DISLIKE_REASONS } from "@/features/deals/vote-reasons";
import { cleanNote, NOTE_MAX } from "@/features/deals/notes";

async function publicDealId(slug: string): Promise<string> {
  const deal = await getDatabase().deal.findFirst({ where: { AND: [{ OR: [{ slug }, { id: slug }] }, publicWhere(listingSchema.parse({}))] }, select: { id: true } });
  if (!deal) throw new CustomerError("Deal not found.", 404);
  return deal.id;
}

/** Who is voting: a signed-in member, or (while voting needs no sign-in) an anonymous browser identified by a cookie id. */
export type Voter = { customerId: string; visitorId?: undefined } | { customerId?: undefined; visitorId: string };
const who = (v: Voter) => (v.customerId ? { customerId: v.customerId } : { visitorId: v.visitorId as string });

/**
 * Likes and dislikes are separate: each is counted on its own, and one person can have a like and a dislike at the same time (neither
 * removes the other). `liked` and `disliked` say what the caller has done; `mine` is kept for older apps (1 like, -1 dislike, 0 none).
 */
export async function voteSummary(slug: string, whoVotes: Voter | string | null) {
  const voter: Voter | null = typeof whoVotes === "string" ? { customerId: whoVotes } : whoVotes;
  const db = getDatabase();
  const dealId = await publicDealId(slug);
  const [up, down, mine] = await Promise.all([
    db.dealVote.count({ where: { dealId, value: 1 } }),
    db.dealVote.count({ where: { dealId, value: -1 } }),
    voter ? db.dealVote.findMany({ where: { dealId, ...who(voter) }, select: { value: true } }) : [],
  ]);
  const liked = mine.some((m) => m.value === 1), disliked = mine.some((m) => m.value === -1);
  return { score: up - down, up, down, liked, disliked, mine: liked ? 1 : disliked ? -1 : 0 };
}

/** `clear` names which kind to take back; value 0 without it clears both (the old behaviour). */
const voteSchema = z.object({ value: z.union([z.literal(1), z.literal(-1), z.literal(0)]), reason: z.enum(DISLIKE_REASONS).optional(), clear: z.union([z.literal(1), z.literal(-1)]).optional() }).strict();

/** value 1 adds a like and -1 a dislike (each at most once per voter and deal); 0 takes one back (see `clear`). */
export async function castVote(whoVotes: Voter | string, slug: string, raw: unknown, ip?: string | null) {
  const { value, reason, clear } = voteSchema.parse(raw);
  const voter: Voter = typeof whoVotes === "string" ? { customerId: whoVotes } : whoVotes;
  if (voter.customerId) {
    await assertActiveCustomer(voter.customerId);
    await limitCustomerRequests(`deal-vote:${voter.customerId}`, 120, 3600);
  } else {
    // shortcut: anonymous votes are one per browser cookie and kind, so clearing cookies allows more; add sign-in (or a stronger check) when abuse shows up.
    await limitCustomerRequests(`deal-vote:v:${voter.visitorId}`, 120, 3600);
    if (ip) await limitCustomerRequests(`deal-vote:ip:${ip}`, 300, 3600);
  }
  const dealId = await publicDealId(slug);
  const db = getDatabase();
  if (value === 0) await db.dealVote.deleteMany({ where: { dealId, ...who(voter), ...(clear ? { value: clear } : {}) } });
  else {
    const reasonValue = value === -1 ? reason ?? null : null;
    const existing = await db.dealVote.findFirst({ where: { dealId, ...who(voter), value }, select: { id: true } });
    if (existing) await db.dealVote.update({ where: { id: existing.id }, data: { reason: reasonValue } });
    else await db.dealVote.create({ data: { dealId, value, reason: reasonValue, ...who(voter) } }).catch((e: { code?: string }) => { if (e.code !== "P2002") throw e; }); // a double tap hits the unique index: already counted
  }
  return voteSummary(slug, voter);
}

const noteSchema = z.object({ content: z.string() }).strict();
const noteSelect = { id: true, content: true, createdAt: true, customerId: true, customer: { select: { forumProfile: { select: { handle: true } } } } } as const;
type NoteRow = { id: string; content: string; createdAt: Date; customerId: string; customer: { forumProfile: { handle: string } | null } };

// The member's chosen user name, never their account name or email.
const noteDto = (n: NoteRow, viewer: string | null) => ({ id: n.id, content: n.content, createdAt: n.createdAt.toISOString(), author: n.customer.forumProfile?.handle ?? "member", mine: Boolean(viewer && viewer === n.customerId) });

export async function listNotes(slug: string, viewer: string | null) {
  const dealId = await publicDealId(slug);
  const rows = await getDatabase().dealNote.findMany({ where: { dealId, removedAt: null }, orderBy: { createdAt: "desc" }, take: 50, select: noteSelect });
  return rows.map((n) => noteDto(n, viewer));
}

export async function addNote(customerId: string, slug: string, raw: unknown) {
  const content = cleanNote(noteSchema.parse(raw).content);
  if (content.length < 3) throw new CustomerError("Write a short tip (at least 3 characters).");
  if (content.length > NOTE_MAX) throw new CustomerError(`Keep it under ${NOTE_MAX} characters.`);
  await assertActiveCustomer(customerId);
  await limitCustomerRequests(`deal-note:${customerId}`, 10, 3600);
  const dealId = await publicDealId(slug);
  return noteDto(await getDatabase().dealNote.create({ data: { dealId, customerId, content }, select: noteSelect }), customerId);
}

/** Members can remove their own note (it is hidden, not erased, so moderators can still review it). */
export async function removeNote(customerId: string, noteId: string) {
  const res = await getDatabase().dealNote.updateMany({ where: { id: noteId, customerId, removedAt: null }, data: { removedAt: new Date() } });
  if (!res.count) throw new CustomerError("Note not found.", 404);
  return { removed: true };
}
