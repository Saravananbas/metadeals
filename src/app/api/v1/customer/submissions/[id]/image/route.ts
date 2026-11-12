import { customerApi } from "@/server/customer/http";
import { getOwnSubmissionImage } from "@/server/customer/submissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** A customer's own submission image, private until the deal itself is published. */
export const GET = (request: Request, { params }: { params: Promise<{ id: string }> }) =>
  customerApi(request, async (customerId) => {
    const { bytes, mimeType } = await getOwnSubmissionImage(customerId, (await params).id);
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": mimeType, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" } });
  });
