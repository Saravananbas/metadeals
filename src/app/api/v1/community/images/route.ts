import { assertDeclaredUploadSize } from "@/server/customer/http";
import { CustomerError } from "@/server/customer/service";
import { communityWrite, json } from "@/server/community/http";
import { stageImage } from "@/server/community/composer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Upload one picture for a post that is still being written. */
export const POST = (request: Request) =>
  communityWrite(request, async (customerId) => {
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) throw new CustomerError("Send the picture as a form upload.", 415);
    assertDeclaredUploadSize(request, 6 * 1024 * 1024, "Each picture must be 5 MB or smaller.");
    const file = (await request.formData()).get("image");
    return json({ data: await stageImage(customerId, file instanceof File && file.size ? Buffer.from(await file.arrayBuffer()) : Buffer.alloc(0)) });
  });
