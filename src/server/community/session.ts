import "server-only";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { getCustomerAuthOptions } from "@/server/customer/options";
import { communityEnabled } from "./config";

/** For server-rendered pages: 404 when the community is switched off; the signed-in customer id (or null) otherwise. */
export async function communityPageViewer(): Promise<string | null> {
  if (!communityEnabled()) notFound();
  try { return (await getServerSession(getCustomerAuthOptions()))?.user?.id ?? null; } catch { return null; }
}
