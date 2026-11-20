import { customerApi, customerJson } from "@/server/customer/http";
import { removeNote } from "@/server/deals/votes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const DELETE = async (request: Request, { params }: { params: Promise<{ slug: string; id: string }> }) => customerApi(request, async (customerId) => customerJson({ data: await removeNote(customerId, (await params).id) }));
