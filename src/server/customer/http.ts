import "server-only";
import { z } from "zod";
import { assertSameOrigin, RequestBodyError } from "@/server/auth/request";
import { DealError } from "@/server/deals/service";
import { CustomerError } from "./service";
import { requireCustomerId } from "./session";

const headers = { "Cache-Control": "no-store" };
export const customerJson = (data: unknown, status = 200) => Response.json(data, { status, headers });

/** Wraps a customer endpoint: same-origin check for writes, session-derived customer id, uniform error mapping. */
export async function customerApi(request: Request, run: (customerId: string) => Promise<Response>): Promise<Response> {
  try {
    if (request.method !== "GET" && request.method !== "HEAD" && !assertSameOrigin(request)) return customerJson({ error: "Request origin could not be verified." }, 403);
    return await run(await requireCustomerId());
  } catch (error) {
    return customerErrorResponse(error);
  }
}

export function customerErrorResponse(error: unknown): Response {
  if (error instanceof CustomerError) return customerJson({ error: error.message }, error.status);
  if (error instanceof DealError) return customerJson({ error: error.message }, error.status);
  if (error instanceof RequestBodyError) return customerJson({ error: error.message }, 400);
  if (error instanceof z.ZodError) return customerJson({ error: error.issues[0]?.message ?? "Check the submitted fields.", fields: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, 400);
  console.error("Customer API failed:", error instanceof Error ? error.message : "unknown");
  return customerJson({ error: "The service is temporarily unavailable." }, 503);
}

const MAX_UPLOAD = 6 * 1024 * 1024;

/** multipart/form-data with a JSON `data` field and an optional `image` file, size-bounded before parsing. */
export async function readSubmissionForm(request: Request): Promise<{ data: unknown; version: unknown; image: Buffer | null }> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) throw new CustomerError("Send the form as multipart/form-data.", 415);
  if (Number(request.headers.get("content-length") ?? 0) > MAX_UPLOAD) throw new CustomerError("The upload is too large (5 MB image limit).", 413);
  const form = await request.formData();
  let data: unknown;
  try { data = JSON.parse(String(form.get("data") ?? "")); } catch { throw new CustomerError("The deal details could not be read."); }
  const file = form.get("image");
  let image: Buffer | null = null;
  if (file instanceof File && file.size > 0) {
    if (file.size > 5 * 1024 * 1024) throw new CustomerError("The image must be 5 MB or smaller.", 413);
    image = Buffer.from(await file.arrayBuffer());
  }
  const version = form.get("version");
  return { data, version: version === null ? undefined : Number(version), image };
}
