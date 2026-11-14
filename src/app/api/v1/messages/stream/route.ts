import { customerApi } from "@/server/customer/http";
import { subscribe, type LiveEvent } from "@/server/messages/bus";
import { participantId, touchPresence } from "@/server/messages/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Live connection (Server-Sent Events) for the signed-in member: new messages, read and delivery receipts, typing.
 * Authorized like every other private endpoint (session cookie, or the app token for native clients); a member only ever
 * receives events addressed to them. Events are hints: after "ready" (first connect and every reconnect) the client reloads from the API.
 */
export const GET = (request: Request) => customerApi(request, async (customerId) => {
  const me = await participantId(customerId);
  const encoder = new TextEncoder();
  let close = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true;
      const send = (text: string) => { if (open) try { controller.enqueue(encoder.encode(text)); } catch { close(); } };
      const unsubscribe = subscribe(me, (event: LiveEvent) => send("event: " + event.type + "\ndata: " + JSON.stringify(event.data) + "\n\n"));
      if (!unsubscribe) { send("event: refused\ndata: {}\n\n"); controller.close(); return; }
      // A comment line every 20 s keeps proxies from closing an idle connection; presence is refreshed once a minute.
      let beats = 0;
      const timer = setInterval(() => { send(": keep-alive\n\n"); if (++beats % 3 === 0) void touchPresence(me); }, 20_000);
      close = () => { if (!open) return; open = false; clearInterval(timer); unsubscribe(); try { controller.close(); } catch { /* already closed */ } };
      request.signal.addEventListener("abort", close);
      void touchPresence(me);
      send("retry: 3000\nevent: ready\ndata: {}\n\n");
    },
    cancel() { close(); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no", Connection: "keep-alive" } });
});
