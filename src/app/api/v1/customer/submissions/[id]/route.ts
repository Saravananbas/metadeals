import { customerApi, customerJson, readSubmissionForm } from "@/server/customer/http";
import { getSubmissionCounts } from "@/server/customer/profile";
import { getOwnSubmission, resubmit } from "@/server/customer/submissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export const GET = (request: Request, { params }: Context) =>
  customerApi(request, async (customerId) => customerJson({ data: await getOwnSubmission(customerId, (await params).id) }));

/** Edit a rejected submission and send it back for review. */
export const PATCH = (request: Request, { params }: Context) =>
  customerApi(request, async (customerId) => {
    const { id } = await params;
    const { data, version, image } = await readSubmissionForm(request);
    return customerJson({ data: await resubmit(customerId, id, data, version, image), counts: await getSubmissionCounts(customerId) });
  });
