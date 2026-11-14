import "server-only";
import { z } from "zod";
import { getAuthEnv } from "@/config/env";
import { getDatabase } from "@/server/db/client";
import { logger } from "@/server/logging/logger";
import { createOpaqueToken, hashOpaqueToken } from "@/server/auth/crypto";
import { createAccountSetupToken, type RequestAuditMetadata } from "@/server/auth/service";
import { roleCan } from "@/server/auth/permissions";
import { DealError } from "@/server/deals/service";
import type { Moderator } from "./moderation";
import { searchMembersMariaDb, usesMariaDb } from "./like-search";

/**
 * Moderator appointments. The chain is: an administrator invites an existing member -> the invitation token (single use, 7 days, stored only as a hash)
 * is opened by that member while signed in -> they accept the guidelines -> a staff account is created and bound to THEIR customer id (email equality is never
 * used as proof) -> they set a password and an authenticator at the normal staff setup page -> 30 days of probation that never ends by itself:
 * an administrator must confirm, extend with a reason, or revoke. Revoking removes access at once and keeps all history.
 */
export const GUIDELINES_VERSION = "2026-11";
export const GUIDELINES = [
  "Act only on what the community rules and the report in front of you support. Do not act on personal disagreement.",
  "Never share what you learn as a moderator: reporter names, member details, private reports or hidden content.",
  "Use the smallest step that works: a warning before a restriction. A restriction lasts at most 7 days and only stops posting.",
  "Never act on your own posts, your own account, or a member you have a personal dispute with. Pass it to another moderator or an administrator.",
  "Content that may expose personal data, secrets or illegal material is hidden at once and handed to an administrator. Do not copy, screenshot or discuss it.",
  "Every action is recorded with your name. Members can appeal, and an administrator who did not take the action decides the appeal.",
  "You cannot publish deals, change settings or reach other staff areas. If you find a way to, report it.",
];
const INVITE_DAYS = 7, PROBATION_DAYS = 30, MAX_EXTENSIONS = 2;
const reason = z.string().trim().min(5, "Give a short reason.").max(300);
const hashInvite = (token: string) => hashOpaqueToken(token, getAuthEnv().AUTH_SESSION_SECRET);
const need = (actor: Moderator, p: "mod:appoint") => { if (!roleCan(actor.role, p)) throw new DealError("Permission denied.", 403); };
const gone = () => new DealError("This invitation is not valid. It may have expired, been used, or belong to someone else.", 410);

async function event(tx: Parameters<Parameters<ReturnType<typeof getDatabase>["$transaction"]>[0]>[0], appointmentId: string, actorId: string | null, action: string, why?: string | null) {
  await tx.moderatorAppointmentEvent.create({ data: { appointmentId, actorId, action, reason: why ?? null } });
  await tx.auditEvent.create({ data: { actorId, action: `moderator.${action}`, targetId: appointmentId, success: true, metadata: why ? { reason: why } : undefined } });
}

export async function listAppointments(actor: Moderator) {
  need(actor, "mod:appoint");
  const rows = await getDatabase().moderatorAppointment.findMany({
    orderBy: { createdAt: "desc" }, take: 100,
    select: {
      id: true, status: true, inviteExpiresAt: true, acceptedAt: true, probationEndsAt: true, extensions: true, confirmedAt: true, revokedAt: true, version: true, createdAt: true,
      customer: { select: { forumProfile: { select: { handle: true } } } },
      events: { orderBy: { createdAt: "asc" }, select: { action: true, reason: true, createdAt: true } },
    },
  });
  const now = Date.now();
  return rows.map((r) => ({
    id: r.id, status: r.status, handle: r.customer.forumProfile?.handle ?? "(no profile)", version: r.version, extensions: r.extensions,
    inviteExpiresAt: r.inviteExpiresAt?.toISOString() ?? null, acceptedAt: r.acceptedAt?.toISOString() ?? null, probationEndsAt: r.probationEndsAt?.toISOString() ?? null,
    decisionDue: r.status === "PROBATION" && Boolean(r.probationEndsAt && r.probationEndsAt.getTime() <= now), confirmedAt: r.confirmedAt?.toISOString() ?? null, revokedAt: r.revokedAt?.toISOString() ?? null,
    events: r.events.map((e) => ({ action: e.action, reason: e.reason, at: e.createdAt.toISOString() })),
  }));
}

/** Creates the invitation. The raw token is returned once, for the administrator to hand to the member; only its hash is kept. */
/** Type-ahead for the invite form: matching members (user name and display name only, never email). Administrators only. */
export async function searchInvitableMembers(actor: Moderator, rawQuery: unknown) {
  need(actor, "mod:appoint");
  const q = z.string().trim().max(30).parse(rawQuery ?? "");
  if (q.length < 1) return [];
  const db = getDatabase();
  const rows = usesMariaDb()
    ? await searchMembersMariaDb(q, 8)
    : (await db.forumProfile.findMany({ where: { status: { not: "SUSPENDED" }, customer: { disabledAt: null, emailVerifiedAt: { not: null } }, OR: [{ handle: { contains: q, mode: "insensitive" } }, { displayName: { contains: q, mode: "insensitive" } }] }, orderBy: { handle: "asc" }, take: 8, select: { handle: true, displayName: true, avatarKey: true, customerId: true } }));
  const open = rows.length ? await db.moderatorAppointment.findMany({ where: { customerId: { in: rows.map((r) => r.customerId) }, status: { in: ["INVITED", "PROBATION", "CONFIRMED"] } }, select: { customerId: true } }) : [];
  const busy = new Set(open.map((o) => o.customerId));
  return rows.map((r) => ({ handle: r.handle, displayName: r.displayName, avatarUrl: r.avatarKey ? `/api/v1/avatars/${r.handle}` : null, alreadyModerator: busy.has(r.customerId) }));
}

export async function inviteModerator(actor: Moderator, raw: unknown) {
  need(actor, "mod:appoint");
  const input = z.object({ handle: z.string().trim().toLowerCase().min(3).max(30), note: z.string().trim().max(300).optional() }).strict().parse(raw);
  const db = getDatabase();
  const profile = await db.forumProfile.findUnique({ where: { handle: input.handle }, select: { id: true, status: true, customer: { select: { id: true, email: true, emailVerifiedAt: true, disabledAt: true } } } });
  if (!profile || profile.customer.disabledAt || !profile.customer.emailVerifiedAt) throw new DealError("Member not found or not eligible.", 404);
  if (profile.status === "SUSPENDED") throw new DealError("A suspended member cannot be invited.", 409);
  const email = profile.customer.email.trim().toLowerCase();
  const staff = await db.user.findUnique({ where: { email }, select: { role: true, linkedCustomerId: true } });
  // A staff account on this email is fine only for a former moderator linked to this same member (re-appointment). Anyone else is refused.
  if (staff && !(staff.role === "COMMUNITY_MODERATOR" && staff.linkedCustomerId === profile.customer.id)) throw new DealError("This member's email already belongs to a staff account.", 409);
  const open = await db.moderatorAppointment.findFirst({ where: { customerId: profile.customer.id, status: { in: ["INVITED", "PROBATION", "CONFIRMED"] } }, select: { id: true } });
  if (open) throw new DealError("This member already has an open invitation or appointment.", 409);
  const token = createOpaqueToken(32);
  const appointment = await db.$transaction(async (tx) => {
    const row = await tx.moderatorAppointment.create({ data: { customerId: profile.customer.id, invitedById: actor.id, status: "INVITED", inviteHash: hashInvite(token), inviteExpiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000), inviteNote: input.note ?? null } });
    await event(tx, row.id, actor.id, "invited", input.note ?? null);
    return row;
  });
  return { appointmentId: appointment.id, token, inviteUrl: `${getAuthEnv().NEXTAUTH_URL.replace(/\/$/, "")}/community/moderator-invite?token=${encodeURIComponent(token)}`, expiresAt: appointment.inviteExpiresAt!.toISOString() };
}

/** What the invited member sees before accepting. Only the member the invitation was made for can open it; everyone else gets the same refusal as for a bad token. */
export async function previewInvitation(customerId: string, token: string) {
  const row = await getDatabase().moderatorAppointment.findUnique({ where: { inviteHash: hashInvite(token) }, select: { customerId: true, status: true, inviteExpiresAt: true } });
  if (!row || row.customerId !== customerId || row.status !== "INVITED" || !row.inviteExpiresAt || row.inviteExpiresAt <= new Date()) throw gone();
  return { guidelinesVersion: GUIDELINES_VERSION, guidelines: GUIDELINES, probationDays: PROBATION_DAYS, expiresAt: row.inviteExpiresAt.toISOString() };
}

/**
 * Accepting is one conditional update, so two simultaneous acceptances (or a replay) cannot both succeed.
 * Afterwards a staff account is created in the normal pending-setup state and bound to this customer; it becomes usable only after the staff setup
 * (password + authenticator app) is completed with the setup link returned here.
 */
export async function acceptInvitation(customerId: string, raw: unknown, metadata: RequestAuditMetadata) {
  const input = z.object({ token: z.string().min(20).max(200), agree: z.literal(true, { message: "You must accept the guidelines." }), guidelinesVersion: z.literal(GUIDELINES_VERSION) }).strict().parse(raw);
  const db = getDatabase(), now = new Date();
  const customer = await db.customer.findUnique({ where: { id: customerId }, select: { id: true, email: true, emailVerifiedAt: true, disabledAt: true } });
  if (!customer || customer.disabledAt || !customer.emailVerifiedAt) throw gone();
  const email = customer.email.trim().toLowerCase();
  const staff = await db.user.findUnique({ where: { email }, select: { id: true, role: true, status: true, linkedCustomerId: true } });
  if (staff && !(staff.role === "COMMUNITY_MODERATOR" && staff.linkedCustomerId === customer.id)) throw new DealError("This email already belongs to a staff account. Ask an administrator.", 409);

  const consumed = await db.$transaction(async (tx) => {
    const row = await tx.moderatorAppointment.findUnique({ where: { inviteHash: hashInvite(input.token) }, select: { id: true, customerId: true } });
    if (!row || row.customerId !== customerId) return null;
    const changed = await tx.moderatorAppointment.updateMany({
      where: { id: row.id, customerId, status: "INVITED", inviteHash: hashInvite(input.token), inviteExpiresAt: { gt: now } },
      data: { status: "PROBATION", inviteHash: null, guidelinesVersion: GUIDELINES_VERSION, guidelinesAcceptedAt: now, acceptedAt: now, probationEndsAt: new Date(now.getTime() + PROBATION_DAYS * 86_400_000), version: { increment: 1 } },
    });
    if (changed.count !== 1) return null;
    await event(tx, row.id, null, "accepted", `customer ${customerId} accepted guidelines ${GUIDELINES_VERSION}`);
    return row.id;
  });
  if (!consumed) throw gone();

  try {
    // A returning (previously revoked) moderator starts from a clean staff login: the old password, authenticator and recovery codes are discarded.
    if (staff) {
      await db.$transaction([
        db.recoveryCode.deleteMany({ where: { userId: staff.id } }),
        db.authSession.deleteMany({ where: { userId: staff.id } }),
        db.user.update({ where: { id: staff.id }, data: { status: "PENDING_SETUP", passwordHash: null, totpSecretEncrypted: null, totpEnabledAt: null, lastTotpStep: BigInt(-1) } }),
      ]);
    }
    const invitedBy = (await db.moderatorAppointment.findUniqueOrThrow({ where: { id: consumed }, select: { invitedById: true } })).invitedById;
    const setup = await createAccountSetupToken({ email, role: "COMMUNITY_MODERATOR", emailDeliveryVerified: true, actorId: invitedBy, metadata });
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: setup.userId }, data: { linkedCustomerId: customerId } });
      // A returning moderator keeps the same staff account: the closed appointment gives up the link (its history stays), the new one takes it.
      const released = await tx.moderatorAppointment.findMany({ where: { staffUserId: setup.userId, id: { not: consumed } }, select: { id: true } });
      for (const old of released) {
        await tx.moderatorAppointment.update({ where: { id: old.id }, data: { staffUserId: null } });
        await event(tx, old.id, null, "staff_account_released", "staff account moved to a newer appointment");
      }
      await tx.moderatorAppointment.update({ where: { id: consumed }, data: { staffUserId: setup.userId } });
      await event(tx, consumed, null, "staff_account_bound", `staff account ${setup.userId} bound to customer ${customerId}`);
    });
    return { appointmentId: consumed, setupUrl: `${getAuthEnv().NEXTAUTH_URL.replace(/\/$/, "")}/admin/setup?token=${encodeURIComponent(setup.token)}`, probationDays: PROBATION_DAYS };
  } catch (error) {
    // The invitation is already used. Leave a clear, audited dead end rather than a half-built moderator: an administrator can invite again.
    await db.$transaction(async (tx) => {
      await tx.moderatorAppointment.updateMany({ where: { id: consumed, status: "PROBATION" }, data: { status: "REVOKED", revokedAt: new Date(), version: { increment: 1 } } });
      await event(tx, consumed, null, "setup_failed", "staff account could not be created");
    }).catch(() => {});
    logger.error({ event: "moderator.accept.setup_failed", reason: error instanceof Error ? error.message : "unknown" }, "moderator staff account setup failed");
    throw new DealError("Your invitation was accepted but the staff account could not be set up. An administrator must invite you again.", 503);
  }
}

const decision = z.object({ version: z.number().int().positive() });

/** Confirmation is a deliberate act: only after the probation period has run, and never automatic. */
export async function confirmModerator(actor: Moderator, id: string, raw: unknown) {
  need(actor, "mod:appoint");
  const input = decision.extend({ note: z.string().trim().max(300).optional() }).strict().parse(raw);
  return getDatabase().$transaction(async (tx) => {
    const row = await tx.moderatorAppointment.findUnique({ where: { id }, select: { status: true, probationEndsAt: true, staffUserId: true } });
    if (!row) throw new DealError("Appointment not found.", 404);
    if (row.status !== "PROBATION" || !row.staffUserId) throw new DealError("Only a moderator on probation can be confirmed.", 409);
    if (!row.probationEndsAt || row.probationEndsAt > new Date()) throw new DealError("The probation period has not finished yet. Extend or wait.", 409);
    const changed = await tx.moderatorAppointment.updateMany({ where: { id, version: input.version, status: "PROBATION" }, data: { status: "CONFIRMED", confirmedAt: new Date(), version: { increment: 1 } } });
    if (changed.count !== 1) throw new DealError("This appointment changed. Reload first.", 409);
    await event(tx, id, actor.id, "confirmed", input.note ?? null);
    return { appointmentId: id };
  });
}

export async function extendProbation(actor: Moderator, id: string, raw: unknown) {
  need(actor, "mod:appoint");
  const input = decision.extend({ days: z.number().int().min(7).max(30), reason }).strict().parse(raw);
  return getDatabase().$transaction(async (tx) => {
    const row = await tx.moderatorAppointment.findUnique({ where: { id }, select: { status: true, probationEndsAt: true, extensions: true } });
    if (!row) throw new DealError("Appointment not found.", 404);
    if (row.status !== "PROBATION") throw new DealError("Only a moderator on probation can be extended.", 409);
    if (row.extensions >= MAX_EXTENSIONS) throw new DealError(`Probation can be extended at most ${MAX_EXTENSIONS} times. Confirm or revoke.`, 409);
    const base = Math.max(Date.now(), row.probationEndsAt?.getTime() ?? 0);
    const changed = await tx.moderatorAppointment.updateMany({ where: { id, version: input.version, status: "PROBATION" }, data: { probationEndsAt: new Date(base + input.days * 86_400_000), extensions: { increment: 1 }, version: { increment: 1 } } });
    if (changed.count !== 1) throw new DealError("This appointment changed. Reload first.", 409);
    await event(tx, id, actor.id, "extended", `${input.days} days: ${input.reason}`);
    return { appointmentId: id };
  });
}

/** Revocation takes effect immediately: the staff account is suspended, every staff session is deleted and unused setup links stop working. History is kept. */
export async function revokeModerator(actor: Moderator, id: string, raw: unknown) {
  need(actor, "mod:appoint");
  const input = decision.extend({ reason }).strict().parse(raw);
  return getDatabase().$transaction(async (tx) => {
    const row = await tx.moderatorAppointment.findUnique({ where: { id }, select: { status: true, staffUserId: true } });
    if (!row) throw new DealError("Appointment not found.", 404);
    if (!["INVITED", "PROBATION", "CONFIRMED"].includes(row.status)) throw new DealError("This appointment is already closed.", 409);
    const changed = await tx.moderatorAppointment.updateMany({ where: { id, version: input.version, status: row.status }, data: { status: "REVOKED", revokedAt: new Date(), inviteHash: null, version: { increment: 1 } } });
    if (changed.count !== 1) throw new DealError("This appointment changed. Reload first.", 409);
    if (row.staffUserId) {
      await tx.user.update({ where: { id: row.staffUserId }, data: { status: "SUSPENDED" } });
      await tx.authSession.deleteMany({ where: { userId: row.staffUserId } });
      await tx.authToken.updateMany({ where: { userId: row.staffUserId, completedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await event(tx, id, actor.id, "revoked", input.reason);
    return { appointmentId: id };
  });
}
