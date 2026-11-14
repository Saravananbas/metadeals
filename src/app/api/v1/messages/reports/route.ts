import { readJson } from "@/server/auth/request";
import { customerApi, customerJson } from "@/server/customer/http";
import { reportMessage } from "@/server/messages/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** { messageId, category, details? }: only a participant can report, and only the other member's message. */
export const POST = (request: Request) => customerApi(request, async (customerId) => {
  const { messageId, ...rest } = ((await readJson(request)) ?? {}) as { messageId?: unknown };
  return customerJson({ data: await reportMessage(customerId, String(messageId ?? ""), rest) }, 201);
});
