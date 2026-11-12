import { customerApi, customerJson } from "@/server/customer/http";
import { removeAvatar, setAvatar } from "@/server/customer/identity";
import { CustomerError } from "@/server/customer/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = (request: Request) =>
  customerApi(request, async (customerId) => {
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) throw new CustomerError("Send the picture as a form upload.", 415);
    if (Number(request.headers.get("content-length") ?? 0) > 3 * 1024 * 1024) throw new CustomerError("The picture must be 2 MB or smaller.", 413);
    const file = (await request.formData()).get("image");
    return customerJson({ data: await setAvatar(customerId, file instanceof File && file.size ? Buffer.from(await file.arrayBuffer()) : null) });
  });
export const DELETE = (request: Request) => customerApi(request, async (customerId) => customerJson({ data: await removeAvatar(customerId) }));
