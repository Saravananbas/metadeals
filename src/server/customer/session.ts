import "server-only";
import { getServerSession } from "next-auth";
import { getDatabase } from "@/server/db/client";
import { getCustomerAuthOptions } from "./options";
import { CustomerError } from "./service";

/** The customer making this request, taken only from the server-validated session (never from the body). */
export async function requireCustomerId(): Promise<string> {
  let id: string | undefined;
  try {
    id = (await getServerSession(getCustomerAuthOptions()))?.user?.id;
  } catch {
    id = undefined;
  }
  if (!id) throw new CustomerError("Please sign in to continue.", 401);
  return id;
}

/** Throws unless the customer exists, is verified and is not disabled. */
export async function assertActiveCustomer(customerId: string) {
  const customer = await getDatabase().customer.findUnique({ where: { id: customerId }, select: { id: true, name: true, email: true, emailVerifiedAt: true, disabledAt: true } });
  if (!customer || customer.disabledAt) throw new CustomerError("This account cannot perform that action.", 403);
  if (!customer.emailVerifiedAt) throw new CustomerError("Verify your email before continuing.", 403);
  return customer;
}
