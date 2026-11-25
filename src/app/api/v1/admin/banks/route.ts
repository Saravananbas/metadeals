import { adminApi } from "@/server/community/admin-http";
import { json } from "@/server/http";
import { createBank, listBanks } from "@/server/admin/banks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = (request: Request) => adminApi(request, async (actor) => json(await listBanks(actor)));
export const POST = (request: Request) => adminApi(request, async (actor) => json(await createBank(actor, await request.json().catch(() => ({})))));
