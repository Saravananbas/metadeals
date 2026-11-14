import { customerApi, customerJson } from "@/server/customer/http";
import { messagesEnabled, unreadCount } from "@/server/messages/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = (request: Request) => customerApi(request, async (customerId) => customerJson({ data: { enabled: messagesEnabled(), unread: messagesEnabled() ? await unreadCount(customerId) : 0 } }));
