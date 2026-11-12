import "server-only";
import { assertSameOrigin } from "@/server/auth/request";
import { getCurrentAuthContext } from "@/server/auth/session";
import { DealError } from "@/server/deals/service";
import { api } from "@/server/http";
import type { Moderator } from "./moderation";

/** Admin endpoint: signed-in staff member, same-origin check for writes. Each use case then checks its own specific permission. */
export const adminApi = (request: Request, run: (actor: Moderator) => Promise<Response>) =>
  api(async () => {
    const context = await getCurrentAuthContext();
    if (!context) throw new DealError("Sign in required.", 401);
    if (request.method !== "GET" && !assertSameOrigin(request)) throw new DealError("Request origin could not be verified.", 403);
    return run({ id: context.user.id, role: context.user.role });
  });
