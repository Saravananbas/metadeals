import { adminApi } from "@/server/community/admin-http";
import { json } from "@/server/http";
import { createBankRule, listBankRules } from "@/server/admin/bank-rules";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = (request: Request) => adminApi(request, async (actor) => json(await listBankRules(actor)));
export const POST = (request: Request) => adminApi(request, async (actor) => json(await createBankRule(actor, await request.json().catch(() => ({})))));
