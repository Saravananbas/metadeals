import "server-only";
import { getDatabase } from "@/server/db/client";

export type ProviderIdentity = { provider: "google" | "apple"; subject: string; email: string; name?: string | null; image?: string | null };

/**
 * Finds or creates the customer for a provider-verified sign-in. Used by the website (NextAuth) and by the native apps,
 * so both follow one rule: a known provider account signs in; a verified email that matches an existing customer links to it;
 * otherwise a new verified customer is created. Callers must already have checked that the provider verified the email.
 * Returns null for a disabled account.
 */
export async function customerForProvider(identity: ProviderIdentity) {
  const email = identity.email.trim().toLowerCase();
  const displayName = identity.name?.slice(0, 80) || "MetaDeals4U shopper";
  const avatarImage = identity.image || null;
  const customer = await getDatabase().$transaction(async (tx) => {
    const known = await tx.customerIdentity.findUnique({ where: { provider_subject: { provider: identity.provider, subject: identity.subject } }, include: { customer: true } });
    if (known) {
      if (!known.customer.image && avatarImage) await tx.customer.update({ where: { id: known.customerId }, data: { image: avatarImage } });
      await tx.customerIdentity.update({ where: { id: known.id }, data: { email, name: displayName, avatarUrl: avatarImage } });
      return known.customer;
    }
    const existing = await tx.customer.findUnique({ where: { email } });
    if (existing) {
      await tx.customerIdentity.create({ data: { customerId: existing.id, provider: identity.provider, subject: identity.subject, email, name: displayName, avatarUrl: avatarImage } });
      if (!existing.image && avatarImage) await tx.customer.update({ where: { id: existing.id }, data: { image: avatarImage } });
      return existing;
    }
    return tx.customer.create({ data: { email, name: displayName, image: avatarImage, emailVerifiedAt: new Date(), identities: { create: { provider: identity.provider, subject: identity.subject, email, name: displayName, avatarUrl: avatarImage } } } });
  });
  return customer.disabledAt ? null : customer;
}
