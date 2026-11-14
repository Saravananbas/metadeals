import { readJson } from "@/server/auth/request";
import { customerErrorResponse, customerJson } from "@/server/customer/http";
import { loginCustomer } from "@/server/customer/service";
import { issueAppToken } from "@/server/customer/app-tokens";
import { clientIpFromHeaders } from "@/server/client-ip";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Native app sign-in: email or user name plus password, answered with an app token (no cookie is set).
 * Uses the same lockout and attack-mode rules as the website sign-in. A wrong password and an unknown account get the same answer.
 */
export async function POST(request: Request) {
  try {
    const body = (await readJson(request)) as Record<string, unknown> | null;
    const customer = await loginCustomer({ email: body?.email ?? body?.identifier, password: body?.password }, clientIpFromHeaders(request.headers));
    if (!customer) return customerJson({ error: "The email, user name or password is not correct." }, 401);
    const device = typeof body?.device === "string" ? body.device : null;
    return customerJson({ data: { ...(await issueAppToken(customer.id, device)), customer: { id: customer.id, name: customer.name } } });
  } catch (error) {
    return customerErrorResponse(error);
  }
}
