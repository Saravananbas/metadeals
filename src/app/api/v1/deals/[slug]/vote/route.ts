import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { assertSameOrigin, readJson } from "@/server/auth/request";
import { clientIpFromHeaders } from "@/server/client-ip";
import { customerErrorResponse, customerJson } from "@/server/customer/http";
import { customerIdFromAppToken, bearerOf } from "@/server/customer/app-tokens";
import { getCustomerAuthOptions } from "@/server/customer/options";
import { castVote, voteSummary, type Voter } from "@/server/deals/votes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Ctx = { params: Promise<{ slug: string }> };

const VISITOR_COOKIE = "md_vid";
const VISITOR_ID = /^[a-f0-9]{32}$/;

/** A signed-in member votes as themselves; everyone else votes anonymously, one vote per browser (a random id kept in a cookie). */
async function whoIsVoting(request: Request): Promise<{ voter: Voter; newVisitorId: string | null }> {
  const bearer = bearerOf(request);
  if (bearer) return { voter: { customerId: await customerIdFromAppToken(bearer) }, newVisitorId: null };
  const member = (await getServerSession(getCustomerAuthOptions()).catch(() => null))?.user?.id;
  if (member) return { voter: { customerId: member }, newVisitorId: null };
  const existing = (await cookies()).get(VISITOR_COOKIE)?.value;
  if (existing && VISITOR_ID.test(existing)) return { voter: { visitorId: existing }, newVisitorId: null };
  const created = randomBytes(16).toString("hex");
  return { voter: { visitorId: created }, newVisitorId: created };
}

const withCookie = (response: Response, id: string | null) => {
  if (id) response.headers.append("Set-Cookie", `${VISITOR_COOKIE}=${id}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
  return response;
};

/** The counts are public; `mine` is filled for a member or a browser that has voted before. */
export async function GET(request: Request, { params }: Ctx) {
  try {
    const { voter } = await whoIsVoting(request);
    return customerJson({ data: await voteSummary((await params).slug, voter) });
  } catch (error) { return customerErrorResponse(error); }
}

export async function POST(request: Request, { params }: Ctx) {
  try {
    if (!bearerOf(request) && !assertSameOrigin(request)) return customerJson({ error: "Request origin could not be verified." }, 403);
    const { voter, newVisitorId } = await whoIsVoting(request);
    const data = await castVote(voter, (await params).slug, await readJson(request), clientIpFromHeaders(request.headers));
    return withCookie(customerJson({ data }), newVisitorId);
  } catch (error) { return customerErrorResponse(error); }
}
