import { z } from "zod";
import { getDatabase } from "@/server/db/client";
import { getCurrentAuthContext } from "@/server/auth/session";
import { assertSameOrigin, readJson } from "@/server/auth/request";
import { assertDealPermission, changeDealState, DealError, getAdminDeal, previewToken, saveDeal, saveTaxonomy } from "@/server/deals/service";
import { dealInclude } from "@/server/deals/repository";
import { boundedBody, normalizeImage, storeImage, removeStoredImage } from "@/server/storage/media";
import { api, json } from "@/server/http";
import { parseDealImport } from "@/server/deals/import";

async function handle(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return api(async () => {
    const context = await getCurrentAuthContext(); if (!context) throw new DealError("Sign in required.", 401);
    if (request.method !== "GET" && !assertSameOrigin(request)) throw new DealError("Request origin could not be verified.", 403);
    const actor = { id: context.user.id, role: context.user.role }; const db = getDatabase();
    await assertDealPermission(db, actor, "deal:edit");
    const [resource, id, action] = (await params).path;
    if (resource === "imports" && request.method === "POST" && !id) {
      const url = new URL(request.url);
      const inputs = await parseDealImport(await boundedBody(request, 1_000_000), url.searchParams.get("format") ?? "csv");
      if (url.searchParams.get("confirm") !== "true") return json({ rows: inputs.length, preview: inputs.map(({ title, slug, priceMinor }) => ({ title, slug, priceMinor })) });
      const ids = await db.$transaction(async (tx) => { const result: string[] = []; for (const input of inputs) result.push((await saveDeal(tx, actor, input)).id); return result; }, { timeout: 30000 });
      return json({ ids, count: ids.length }, 201);
    }
    if (resource === "media" && request.method === "POST" && !id) {
      const alt = z.string().trim().min(1).max(240).parse(new URL(request.url).searchParams.get("alt"));
      const normalized = await normalizeImage(await boundedBody(request));
      const storage = await storeImage(normalized.bytes);
      try { const media = await db.$transaction(async (tx) => {
        const row = await tx.media.create({ data: { ...storage, width: normalized.width, height: normalized.height, mimeType: normalized.mimeType, byteSize: normalized.bytes.length, alt, uploadedById: actor.id } });
        await tx.auditEvent.create({ data: { actorId: actor.id, action: "media.uploaded", targetId: row.id, success: true } }); return row;
      }); return json({ data: { id: media.id, url: `/api/v1/media/${media.id}`, alt } }, 201); }
      catch (error) { await removeStoredImage(storage.provider, storage.storageKey); throw error; }
    }
    if ((resource === "categories" || resource === "merchants") && !action) {
      if (request.method === "GET") return json({ data: await (resource === "categories" ? db.category.findMany({ take: 500, orderBy: { name: "asc" } }) : db.merchant.findMany({ take: 500, orderBy: { name: "asc" } })) });
      if (request.method === "POST" || request.method === "PUT") { const body = await readJson(request); return json({ data: await db.$transaction((tx) => saveTaxonomy(tx, actor, resource, body, id), { isolationLevel: "Serializable" }) }); }
    }
    if (resource !== "deals") throw new DealError("Endpoint not found.", 404);
    if (request.method === "GET") {
      if (id) return json({ data: await getAdminDeal(db, id) });
      const page = z.coerce.number().int().min(1).max(1000).parse(new URL(request.url).searchParams.get("page") ?? 1);
      return json({ data: await db.deal.findMany({ take: 50, skip: (page - 1) * 50, orderBy: { updatedAt: "desc" }, include: dealInclude }), page });
    }
    const body = await readJson(request);
    if (id && action === "preview" && request.method === "POST") { const deal = await getAdminDeal(db, id); return json({ data: deal, previewToken: previewToken(actor.id, id, deal.version) }); }
    if (id && (action === "publish" || action === "archive" || request.method === "DELETE")) {
      const input = z.object({ version: z.number().int().positive(), previewToken: z.string().max(2000).optional() }).parse(body);
      return json({ data: await db.$transaction((tx) => changeDealState(tx, actor, id, request.method === "DELETE" ? "delete" : action as "publish" | "archive", input.version, input.previewToken)) });
    }
    if ((!id && request.method === "POST") || (id && request.method === "PUT")) {
      const input = z.object({ deal: z.unknown(), version: z.number().int().positive().optional() }).parse(body);
      return json({ data: await db.$transaction((tx) => saveDeal(tx, actor, input.deal, id, input.version)) }, id ? 200 : 201);
    }
    throw new DealError("Method not supported.", 405);
  });
}
export { handle as GET, handle as POST, handle as PUT, handle as DELETE };
