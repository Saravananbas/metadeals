import "server-only";
import { getDatabase } from "@/server/db/client";
import { profileSchema } from "@/features/customer/profile-validation";
import { CustomerError, limitCustomerRequests } from "./service";
import { assertActiveCustomer } from "./session";

export type SubmissionCounts = { total: number; pendingReview: number; approvedAwaitingPublication: number; rejected: number; live: number };

/** Counts come straight from the database for this customer only. */
export async function getSubmissionCounts(customerId: string): Promise<SubmissionCounts> {
  const db = getDatabase();
  const where = { customerId };
  const [total, pendingReview, approved, rejected, live] = await Promise.all([
    db.communityDealSubmission.count({ where }),
    db.communityDealSubmission.count({ where: { ...where, status: "PENDING_REVIEW" } }),
    db.communityDealSubmission.count({ where: { ...where, status: "APPROVED" } }),
    db.communityDealSubmission.count({ where: { ...where, status: "REJECTED" } }),
    db.communityDealSubmission.count({ where: { ...where, status: "APPROVED", deal: { is: { everPublished: true } } } }),
  ]);
  return { total, pendingReview, approvedAwaitingPublication: Math.max(0, approved - live), rejected, live };
}

export async function getProfile(customerId: string) {
  const customer = await assertActiveCustomer(customerId);
  const row = await getDatabase().customer.findUniqueOrThrow({
    where: { id: customer.id },
    select: { id: true, name: true, email: true, image: true, sex: true, dateOfBirth: true, location: true, createdAt: true },
  });
  return {
    id: row.id, name: row.name, email: row.email, image: row.image, sex: row.sex, location: row.location,
    dateOfBirth: row.dateOfBirth ? row.dateOfBirth.toISOString().slice(0, 10) : null,
    memberSince: row.createdAt.toISOString(),
    counts: await getSubmissionCounts(customer.id),
  };
}

/** Updates only the signed-in customer's own row; the id comes from the session, never from the payload. */
export async function updateProfile(customerId: string, raw: unknown) {
  const customer = await assertActiveCustomer(customerId);
  await limitCustomerRequests(`profile:${customer.id}`, 30, 3600);
  const input = profileSchema.parse(raw);
  await getDatabase().customer.update({
    where: { id: customer.id },
    data: {
      name: input.name,
      sex: input.sex ?? null,
      dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth + "T00:00:00Z") : null,
      location: input.location ? input.location : null,
    },
  });
  return getProfile(customer.id);
}

export { CustomerError };
