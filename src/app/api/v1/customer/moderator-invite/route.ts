import { getRequestMetadata, readJson } from "@/server/auth/request";
import { customerApi, customerJson } from "@/server/customer/http";
import { acceptInvitation, previewInvitation } from "@/server/community/moderators";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The invited member opens and accepts their moderator invitation. Both calls need the member's own signed-in session:
 * holding the token alone is not enough, and a token made for someone else behaves like a wrong token.
 */
export const GET = (request: Request) => customerApi(request, async (customerId) => customerJson({ data: await previewInvitation(customerId, new URL(request.url).searchParams.get("token") ?? "") }));
export const POST = (request: Request) => customerApi(request, async (customerId) => customerJson({ data: await acceptInvitation(customerId, await readJson(request), getRequestMetadata(request)) }, 201));
