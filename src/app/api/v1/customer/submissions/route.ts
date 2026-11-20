import { customerApi, customerJson, readSubmissionForm } from "@/server/customer/http";
import { getSubmissionCounts } from "@/server/customer/profile";
import { createSubmission, listOwnSubmissions } from "@/server/customer/submissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = (request: Request) =>
  customerApi(request, async (customerId) => customerJson({ data: await listOwnSubmissions(customerId), counts: await getSubmissionCounts(customerId) }));

export const POST = (request: Request) =>
  customerApi(request, async (customerId) => {
    const { data, image, extras } = await readSubmissionForm(request);
    return customerJson({ data: await createSubmission(customerId, data, image, extras), counts: await getSubmissionCounts(customerId) }, 201);
  });
