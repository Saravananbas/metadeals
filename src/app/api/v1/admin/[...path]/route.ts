import { merchantSelect } from "@/server/deals/repository";
import { z } from "zod";
import { getDatabase } from "@/server/db/client";
import { getCurrentAuthContext } from "@/server/auth/session";
import { assertSameOrigin, readJson } from "@/server/auth/request";
import { assertDealPermission, changeDealState, DealError, getAdminDeal, previewToken, saveDeal, saveTaxonomy } from "@/server/deals/service";
import { dealInclude } from "@/server/deals/repository";
import { boundedBody, normalizeImage, storeImage, removeStoredImage } from "@/server/storage/media";
import { api, json } from "@/server/http";
import { parseDealImport } from "@/server/deals/import";
import { getAffiliateClickStats, getAffiliateTransactions, importAffiliateTransactions } from "@/server/affiliate/service";
import { importBatchSchema } from "@/server/affiliate/types";
import { createDestination, listDestinations, publishDealToDestinations, getDistributionHistory } from "@/server/distribution/service";
import { destinationInputSchema, publishDealInputSchema } from "@/features/distribution/formatting";
import { getUnifiedAnalyticsSummary } from "@/server/analytics/service";
import { scraperService } from "@/server/scraper/service";
import { candidateReviewActionSchema } from "@/features/scraper/validation";

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
      if (request.method === "GET") return json({ data: await (resource === "categories" ? db.category.findMany({ take: 500, orderBy: { name: "asc" } }) : db.merchant.findMany({ take: 500, orderBy: { name: "asc" }, select: merchantSelect })) });
      if (request.method === "POST" || request.method === "PUT") { const body = await readJson(request); return json({ data: await db.$transaction((tx) => saveTaxonomy(tx, actor, resource, body, id), { isolationLevel: "Serializable" }) }); }
    }
    if (resource === "affiliate") {
      const url = new URL(request.url);
      if (id === "clicks" && request.method === "GET") {
        const dealId = url.searchParams.get("dealId") ?? undefined;
        const merchantId = url.searchParams.get("merchantId") ?? undefined;
        const channel = url.searchParams.get("channel") ?? undefined;
        return json({ data: await getAffiliateClickStats(db, actor, { dealId, merchantId, channel }) });
      }
      if (id === "transactions") {
        if (request.method === "GET") {
          const provider = url.searchParams.get("provider") ?? undefined;
          const status = url.searchParams.get("status") ?? undefined;
          return json({ data: await getAffiliateTransactions(db, actor, { provider, status }) });
        }
        if (request.method === "POST") {
          const raw = await readJson(request);
          const parsed = importBatchSchema.parse(raw);
          return json({ data: await importAffiliateTransactions(db, actor, parsed) }, 201);
        }
      }
      throw new DealError("Affiliate endpoint not found.", 404);
    }
    if (resource === "distribution") {
      const url = new URL(request.url);
      if (id === "destinations") {
        if (request.method === "GET") return json({ data: await listDestinations(db, actor) });
        if (request.method === "POST") {
          const body = destinationInputSchema.parse(await readJson(request));
          return json({ data: await createDestination(db, actor, body) }, 201);
        }
      }
      if (id === "publish" && request.method === "POST") {
        const body = publishDealInputSchema.parse(await readJson(request));
        return json({ data: await publishDealToDestinations(db, actor, body) });
      }
      if (id === "history" && request.method === "GET") {
        const dealId = url.searchParams.get("dealId") ?? undefined;
        return json({ data: await getDistributionHistory(db, actor, dealId) });
      }
      throw new DealError("Distribution endpoint not found.", 404);
    }
    if (resource === "analytics" && request.method === "GET") {
      return json({ data: await getUnifiedAnalyticsSummary(db, actor) });
    }
    if (resource === "scraper") {
      const url = new URL(request.url);
      if (id === "candidates") {
        if (request.method === "GET") {
          const statusParam = url.searchParams.get("status");
          const validStatuses = ["DISCOVERED", "VALIDATING", "VERIFIED", "UNCERTAIN", "REJECTED", "PUBLISHED"] as const;
          type StatusType = (typeof validStatuses)[number];
          const status: StatusType | undefined = statusParam && (validStatuses as readonly string[]).includes(statusParam)
            ? (statusParam as StatusType)
            : undefined;
          const limit = url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : 20;
          const offset = url.searchParams.get("offset") ? Number(url.searchParams.get("offset")) : 0;
          return json({ data: await scraperService.listCandidates(db, { status, limit, offset }) });
        }
        if (request.method === "POST") {
          const body = await readJson(request);
          return json({ data: await scraperService.ingestCandidate(db, body) }, 201);
        }
      }
      if (id === "review" && request.method === "POST") {
        const body = await readJson(request) as { candidateId: string; action: "APPROVE" | "REJECT"; reason?: string };
        const actionParsed = candidateReviewActionSchema.parse({ action: body.action, reason: body.reason });
        return json({ data: await scraperService.reviewCandidate(db, body.candidateId, actionParsed, actor.id) });
      }
      if (id === "scan" && request.method === "POST") {
        const body = await readJson(request) as { connectorCode: string };
        return json({ data: await scraperService.runConnectorScan(db, body.connectorCode) });
      }
      if (id === "metrics" && request.method === "GET") {
        return json({ data: await scraperService.getScraperMetrics(db) });
      }
      throw new DealError("Scraper endpoint not found.", 404);
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
