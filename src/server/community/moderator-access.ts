import "server-only";
import { assertSameOrigin } from "@/server/auth/request";
import { getCurrentAuthContext } from "@/server/auth/session";
import { getDatabase } from "@/server/db/client";
import { DealError } from "@/server/deals/service";
import { api } from "@/server/http";
import type { Moderator } from "./moderation";

/**
 * The single gate for the moderator dashboard and its APIs. Being signed in as staff is not enough: the account must be a COMMUNITY_MODERATOR whose
 * appointment is in force right now. Checked on every request, so revoking takes effect immediately even for a session that is still open.
 *  - the staff account is ACTIVE with an authenticator, and is bound to a customer (never matched by email),
 *  - that customer is not disabled,
 *  - the appointment belongs to this same staff account and is CONFIRMED, or is on probation that has not run out
 *    (probation that ran out without an administrator's decision pauses access: it is never treated as confirmation).
 */
export async function checkModeratorAccess(userId: string, now = new Date()) {
  const db = getDatabase();
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, role: true, status: true, totpEnabledAt: true, linkedCustomerId: true } });
  const deny = () => new DealError("Moderator access is not active.", 403);
  if (!user || user.role !== "COMMUNITY_MODERATOR" || user.status !== "ACTIVE" || !user.totpEnabledAt || !user.linkedCustomerId) throw deny();
  const appointment = await db.moderatorAppointment.findUnique({
    where: { staffUserId: user.id },
    select: { id: true, customerId: true, status: true, probationEndsAt: true, customer: { select: { disabledAt: true } } },
  });
  if (!appointment || appointment.customerId !== user.linkedCustomerId || appointment.customer.disabledAt) throw deny();
  const inProbation = appointment.status === "PROBATION" && Boolean(appointment.probationEndsAt && appointment.probationEndsAt > now);
  if (appointment.status !== "CONFIRMED" && !inProbation) throw deny();
  return { actor: { id: user.id, role: user.role } as Moderator, appointment: { id: appointment.id, status: appointment.status, probationEndsAt: appointment.probationEndsAt?.toISOString() ?? null, customerId: appointment.customerId } };
}

export async function currentModerator() {
  const context = await getCurrentAuthContext();
  if (!context) throw new DealError("Sign in required.", 401);
  return checkModeratorAccess(context.user.id);
}

/** Moderator-only API wrapper: moderator access check, same-origin check for writes, uniform errors. Administrators use the admin endpoints instead. */
export const moderatorApi = (request: Request, run: (access: Awaited<ReturnType<typeof checkModeratorAccess>>) => Promise<Response>) =>
  api(async () => {
    if (request.method !== "GET" && !assertSameOrigin(request)) throw new DealError("Request origin could not be verified.", 403);
    return run(await currentModerator());
  });
