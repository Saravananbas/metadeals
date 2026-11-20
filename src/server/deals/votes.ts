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

/** Good Deal score: thumbs up minus thumbs down. `mine` is the caller's own vote (0 when none or signed out). */
export async function voteSummary(slug: string, customerId: string | null) {
  const db = getDatabase();
  const dealId = await publicDealId(slug);
  const [up, down, mine] = await Promise.all([
    db.dealVote.count({ where: { dealId, value: 1 } }),
    db.dealVote.count({ where: { dealId, value: -1 } }),
    customerId ? db.dealVote.findUnique({ where: { customerId_dealId: { customerId, dealId } }, select: { value: true } }) : null,
  ]);
  return { score: up - down, up, down, mine: mine?.value ?? 0 };
}

const voteSchema = z.object({ value: z.union([z.literal(1), z.literal(-1), z.literal(0)]), reason: z.enum(DISLIKE_REASONS).optional() }).strict();

/** 1 or -1 sets (or switches) the vote, 0 clears it. One row per member per deal. */
export async function castVote(customerId: string, slug: string, raw: unknown) {
  const { value, reason } = voteSchema.parse(raw);
  await assertActiveCustomer(customerId);
  await limitCustomerRequests(`deal-vote:${customerId}`, 120, 3600);
  const dealId = await publicDealId(slug);
  const db = getDatabase();
  if (value === 0) await db.dealVote.deleteMany({ where: { customerId, dealId } });
  else await db.dealVote.upsert({ where: { customerId_dealId: { customerId, dealId } }, create: { customerId, dealId, value, reason: value === -1 ? reason ?? null : null }, update: { value, reason: value === -1 ? reason ?? null : null } });
  return voteSummary(slug, customerId);
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
