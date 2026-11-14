import { customerApi, customerJson } from "@/server/customer/http";
import { bearerOf, revokeAppToken } from "@/server/customer/app-tokens";
import { getIdentity } from "@/server/customer/identity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Who the app token belongs to (public identity only). */
export const GET = (request: Request) => customerApi(request, async (customerId) => customerJson({ data: await getIdentity(customerId) }));
/** Sign out on this device: the token stops working at once. */
export const DELETE = (request: Request) => customerApi(request, async () => {
  const token = bearerOf(request);
  if (token) await revokeAppToken(token);
  return customerJson({ data: { signedOut: true } });
});
