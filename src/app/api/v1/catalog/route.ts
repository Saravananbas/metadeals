import { getDatabase } from "@/server/db/client";
import { api, json } from "@/server/http";
export async function GET() { return api(async () => { const db = getDatabase(); const [categories, merchants] = await Promise.all([db.category.findMany({ take: 500, orderBy: { name: "asc" } }), db.merchant.findMany({ take: 500, orderBy: { name: "asc" }, select: { id: true, name: true, slug: true } })]); return json({ categories, merchants }); }); }
