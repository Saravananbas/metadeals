import { adminApi } from "@/server/community/admin-http";
import { json } from "@/server/http";
import { deleteBank, updateBank } from "@/server/admin/banks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const PATCH = (request: Request, context: { params: Promise<{ id: string }> }) => adminApi(request, async (actor) => json(await updateBank(actor, (await context.params).id, await request.json().catch(() => ({})))));
export const DELETE = (request: Request, context: { params: Promise<{ id: string }> }) => adminApi(request, async (actor) => json(await deleteBank(actor, (await context.params).id)));
