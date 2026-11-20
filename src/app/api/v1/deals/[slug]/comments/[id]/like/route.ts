import { customerApi, customerJson } from "@/server/customer/http";
import { setCommentLike } from "@/server/deals/comment-actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string; id: string }> };
export const PUT = (request: Request, { params }: Ctx) => customerApi(request, async (customerId) => customerJson({ data: await setCommentLike(customerId, (await params).id, true) }));
export const DELETE = (request: Request, { params }: Ctx) => customerApi(request, async (customerId) => customerJson({ data: await setCommentLike(customerId, (await params).id, false) }));
