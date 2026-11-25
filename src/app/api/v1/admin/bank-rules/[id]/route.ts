import { adminApi } from "@/server/community/admin-http";
import { json } from "@/server/http";
import { deleteBankRule, updateBankRule } from "@/server/admin/bank-rules";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };
export const PUT = (request: Request, context: Ctx) => adminApi(request, async (actor) => json(await updateBankRule(actor, (await context.params).id, await request.json().catch(() => ({})))));
export const DELETE = (request: Request, context: Ctx) => adminApi(request, async (actor) => json(await deleteBankRule(actor, (await context.params).id)));
