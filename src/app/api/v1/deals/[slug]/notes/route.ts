import { getServerSession } from "next-auth";
import { readJson } from "@/server/auth/request";
import { customerApi, customerErrorResponse, customerJson } from "@/server/customer/http";
import { getCustomerAuthOptions } from "@/server/customer/options";
import { addNote, listNotes } from "@/server/deals/votes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Ctx = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const viewer = (await getServerSession(getCustomerAuthOptions()).catch(() => null))?.user?.id ?? null;
    return customerJson({ data: { notes: await listNotes((await params).slug, viewer) } });
  } catch (error) { return customerErrorResponse(error); }
}
export const POST = async (request: Request, { params }: Ctx) => customerApi(request, async (customerId) => customerJson({ data: { note: await addNote(customerId, (await params).slug, await readJson(request)) } }, 201));
