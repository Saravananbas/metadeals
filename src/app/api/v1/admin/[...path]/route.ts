import { merchantSelect } from "@/server/deals/repository";
import { z } from "zod";
import { getDatabase } from "@/server/db/client";
import { getCurrentAuthContext } from "@/server/auth/session";
import { roleCan } from "@/server/auth/permissions";
import { MerchantDirectoryStatus, MerchantDirectoryVerification } from "@/generated/prisma/client";
import { assertSameOrigin, readJson } from "@/server/auth/request";
import { changeDealState, DealError, getAdminDeal, previewToken, saveDeal, saveTaxonomy } from "@/server/deals/service";
import { dealInclude } from "@/server/deals/repository";
import { boundedBody, normalizeImage, storeImage, removeStoredImage } from "@/server/storage/media";
import { api, json } from "@/server/http";
import { parseDealImport } from "@/server/deals/import";
import { getAffiliateClickStats, getAffiliateTransactions, importAffiliateTransactions } from "@/server/affiliate/service";
import { importBatchSchema } from "@/server/affiliate/types";
import { autoPostToTelegram, createDestination, listDestinations, publishDealToDestinations, getDistributionHistory } from "@/server/distribution/service";
import { destinationInputSchema, publishDealInputSchema } from "@/features/distribution/formatting";
import { getUnifiedAnalyticsSummary } from "@/server/analytics/service";
import { approveSubmission, getSubmissionImage, listSubmissions, rejectSubmission } from "@/server/community/review";
import { getDashboard, getLive, getSessionTimeline, listSessions, resolveRange, vendorReport } from "@/server/analytics/queries";
import { scraperService } from "@/server/scraper/service";
import { candidateReviewActionSchema } from "@/features/scraper/validation";
import { productExtractionService } from "@/server/product-extraction/core/service";
import { adapterRegistry } from "@/server/product-extraction/core/registry";
import { applyDeterministicFieldFallback } from "@/server/product-extraction/core/strategy-engine";
import { matchCategoryAndMerchant } from "@/server/product-extraction/core/normalizer";
import type { NormalizedProductExtraction } from "@/server/product-extraction/core/types";
import {
  parseJsonLd,
  parseOpenGraph,
  parseHtmlMetadata,
  parseEmbeddedJson,
  parseTitleToBrand,
  resolveUrl,
} from "@/server/product-extraction/adapters/base";
import { importProductImageFromUrl } from "@/server/product-extraction/media/image-import";
import { validateProductUrl } from "@/server/product-extraction/security/url-validator";
import { safeFetchText } from "@/server/product-extraction/security/fetch-policy";
import { findActiveDirectoryMerchantForUrl } from "@/server/product-extraction/core/merchant-directory-match";
import { cuelinksClient } from "@/server/affiliate/cuelinks-client";
import { youtubeReviewsService } from "@/server/youtube/reviews-service";
import { youTubeQuotaService } from "@/server/youtube/quota-service";
import { MerchantWebsiteDirectoryService, merchantWebsiteDirectorySchema } from "@/server/merchants/directory-service";

const merchantWebsiteListQuerySchema = z.object({
  search: z.string().trim().max(150).optional(),
  category: z.string().trim().max(100).optional(),
  status: z.nativeEnum(MerchantDirectoryStatus).optional(),
  verificationStatus: z.nativeEnum(MerchantDirectoryVerification).optional(),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["name", "createdAt", "status", "domain"]).default("name"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

const merchantWebsitePatchSchema = z.object({
  status: z.nativeEnum(MerchantDirectoryStatus).optional(),
  verificationStatus: z.nativeEnum(MerchantDirectoryVerification).optional(),
  pushToHome: z.boolean().optional(),
  logoMediaId: z.string().trim().max(100).nullable().optional(),
  logoUrl: z.string().trim().max(2048).nullable().optional(),
});

async function handle(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return api(async () => {
    const context = await getCurrentAuthContext(); if (!context) throw new DealError("Sign in required.", 401);
    if (request.method !== "GET" && !assertSameOrigin(request)) throw new DealError("Request origin could not be verified.", 403);
    const actor = { id: context.user.id, role: context.user.role }; const db = getDatabase();
    // The session lookup already verified active status, TOTP and the live role.
    // Reuse that trusted context instead of issuing another user query per request.
    if (!roleCan(context.user.role, "deal:edit")) throw new DealError("Permission denied.", 403);
    const [resource, id, action] = (await params).path;
    if (resource === "merchant-websites") {
      if (request.method === "GET") {
        if (id) {
          const merchant = await MerchantWebsiteDirectoryService.getById(id);
          if (!merchant) throw new DealError("Merchant website not found.", 404);
          return json({ data: merchant });
        }
        const url = new URL(request.url);
        const filters = merchantWebsiteListQuerySchema.parse(Object.fromEntries(url.searchParams));

        const result = await MerchantWebsiteDirectoryService.list({
          ...filters,
        });
        return json(result);
      }

      if (request.method === "POST" && !id) {
        const body = await readJson(request);
        const created = await MerchantWebsiteDirectoryService.create(body);
        return json({ data: created }, 201);
      }

      if (request.method === "PUT" && id) {
        const body = merchantWebsiteDirectorySchema.partial().parse(await readJson(request));
        const updated = await MerchantWebsiteDirectoryService.update(id, body);
        return json({ data: updated });
      }

      if (request.method === "PATCH" && id) {
        const body = merchantWebsitePatchSchema.parse(await readJson(request));
        if (body.pushToHome) {
          const syncRes = await MerchantWebsiteDirectoryService.syncToOperationalMerchant(id);
          return json({ data: syncRes.directoryItem, operational: syncRes.operational, message: `Pushed "${syncRes.directoryItem.name}" to live operational stores.` });
        }
        if (body.logoMediaId !== undefined || body.logoUrl !== undefined) {
          const updated = await MerchantWebsiteDirectoryService.update(id, {
            logoMediaId: body.logoMediaId,
            logoUrl: body.logoUrl,
          });
          return json({ data: updated });
        }
        if (body.status) {
          const updated = await MerchantWebsiteDirectoryService.toggleStatus(id, body.status);
          return json({ data: updated });
        }
        if (body.verificationStatus) {
          const updated = await MerchantWebsiteDirectoryService.update(id, { verificationStatus: body.verificationStatus });
          return json({ data: updated });
        }
      }

      if (request.method === "DELETE" && id) {
        const url = new URL(request.url);
        const permanent = url.searchParams.get("permanent") === "true";
        if (permanent) {
          await MerchantWebsiteDirectoryService.delete(id);
          return json({ success: true, message: "Merchant website permanently deleted." });
        }
        const updated = await MerchantWebsiteDirectoryService.softDelete(id);
        return json({ data: updated, message: "Merchant website deactivated." });
      }

      throw new DealError("Method not supported on merchant-websites.", 405);
    }

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
    if (resource === "product-extraction") {
      if (id === "inspect" && request.method === "POST") {
        // HTML review accepts pasted product source documents. Keep this route
        // bounded while leaving other JSON endpoints at the 16 KiB default.
        const body = (await readJson(request, 1_000_000)) as {
          url?: string;
          html?: string;
          importImage?: boolean;
          imageUrl?: string;
          title?: string;
        };

        if (body.importImage && body.imageUrl) {
          const imp = await importProductImageFromUrl(body.imageUrl, body.title || "Product", actor.id);
          return json({ data: imp });
        }

        let html = body.html?.trim() || "";
        const targetUrl = body.url?.trim() || "";
        const directoryMerchant = targetUrl
          ? await findActiveDirectoryMerchantForUrl(db, targetUrl).catch(() => null)
          : null;

        if (!html && targetUrl) {
          let urlValidation = validateProductUrl(targetUrl);
          if (!urlValidation.valid && urlValidation.error?.startsWith("Retailer domain ")) {
            if (directoryMerchant) urlValidation = validateProductUrl(targetUrl, directoryMerchant);
          }
          if (urlValidation.valid) {
            const sourceAdapter = adapterRegistry.findAdapterForUrl(urlValidation.url!) || (directoryMerchant
              ? adapterRegistry.getAdapterById("generic-structured-data")
              : undefined);
            const mayFetchRetailerHtml = sourceAdapter?.id !== "amazon-india" ||
              (await sourceAdapter.checkAuthorization()).authorized;
            if (mayFetchRetailerHtml) {
              try {
                const fetched = await safeFetchText(targetUrl, {
                  timeoutMs: 9000,
                  maxBytes: 500_000,
                  ...(directoryMerchant ? { allowedDomains: [directoryMerchant.domain] } : {}),
                });
                html = fetched.text;
              } catch (err) {
                console.warn("Direct inspect fetch error:", err);
              }
            }
          }
        }

        const origin = targetUrl ? (() => { try { return new URL(targetUrl).origin; } catch { return undefined; } })() : undefined;
        const jsonLd = html ? parseJsonLd(html, origin) : {};
        const og = html ? parseOpenGraph(html, origin) : {};
        const meta = html ? parseHtmlMetadata(html, origin) : {};
        const embedded = html ? parseEmbeddedJson(html, origin) : {};

        let title = jsonLd.name || og.title || meta.title || embedded.title || "";
        if (!title && html) {
          const h1Match = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
          if (h1Match) title = h1Match[1].replace(/<[^>]+>/g, "").trim();
        }

        let brand = jsonLd.brand || og.brand || meta.brand || embedded.brand || "";
        if (!brand && title) {
          brand = parseTitleToBrand(title) || "";
        }

        let description = jsonLd.description || og.description || meta.description || embedded.description || "";
        let inferredCategoryId = "";
        try {
          const taxonomy = await matchCategoryAndMerchant(db, {
            merchant: { retailerName: "", retailerSlug: "", canonicalUrl: targetUrl, originalUrl: targetUrl },
            content: {
              category: { value: typeof jsonLd.category === "string" ? jsonLd.category : null },
              subcategory: { value: null },
              breadcrumb: { value: [] },
            },
            identity: { title: { value: title }, brand: { value: brand } },
          } as unknown as NormalizedProductExtraction);
          inferredCategoryId = taxonomy.categoryId || "";
        } catch (error) {
          console.warn("HTML review category inference failed:", error);
        }
        let price = jsonLd.price || og.price || meta.price || embedded.price || null;
        let mrp = jsonLd.mrp || og.mrp || meta.mrp || embedded.mrp || null;

        const imagesSet = new Set<string>();
        if (jsonLd.image) imagesSet.add(jsonLd.image);
        if (og.image) imagesSet.add(og.image);
        if (meta.image) imagesSet.add(meta.image);
        if (embedded.image) imagesSet.add(embedded.image);
        if (Array.isArray(jsonLd.additionalImages)) jsonLd.additionalImages.forEach((i) => i && imagesSet.add(i));
        if (Array.isArray(og.additionalImages)) og.additionalImages.forEach((i) => i && imagesSet.add(i));

        if (html) {
          const imgRegex = /<img\b[^>]*>/gi;
          let imgMatch;
          while ((imgMatch = imgRegex.exec(html)) !== null) {
            const tag = imgMatch[0];
            const attributes = new Map<string, string>();
            const attributeRegex = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
            let attributeMatch;
            while ((attributeMatch = attributeRegex.exec(tag)) !== null) {
              attributes.set(attributeMatch[1].toLowerCase(), attributeMatch[2] ?? attributeMatch[3] ?? attributeMatch[4] ?? "");
            }
            const descriptor = `${attributes.get("alt") || ""} ${attributes.get("class") || ""} ${attributes.get("id") || ""}`.toLowerCase();
            if (/logo|icon|avatar|sprite|tracking|pixel/.test(descriptor)) continue;

            const candidates = [
              attributes.get("data-zoom-image"),
              attributes.get("data-original"),
              attributes.get("data-lazy-src"),
              attributes.get("data-src"),
              attributes.get("src"),
              ...(attributes.get("srcset") || "").split(",").map((entry) => entry.trim().split(/\s+/)[0]),
            ];
            for (const candidate of candidates) {
              if (!candidate || candidate.startsWith("data:") || /\.svg(?:[?#]|$)/i.test(candidate)) continue;
              const resolved = resolveUrl(candidate, origin);
              if (!resolved) continue;
              try {
                const parsed = new URL(resolved);
                if (parsed.protocol === "https:" || parsed.protocol === "http:") imagesSet.add(parsed.href);
              } catch {
                // Ignore invalid or non-web image sources from the page.
              }
              break;
            }
            if (imagesSet.size > 20) break;
          }
        }

        // Share the Fetch page's deterministic adapter rules with Review.
        // Do not guess a price from arbitrary page text or manufacture an MRP.
        if (targetUrl && html) {
          try {
            const parsedUrl = new URL(targetUrl);
            const adapter = adapterRegistry.findAdapterForUrl(parsedUrl) || (directoryMerchant
              ? adapterRegistry.getAdapterById("generic-structured-data")
              : undefined);
            if (adapter) {
              let pageExtraction = await adapter.extract({
                url: parsedUrl,
                rawUrl: targetUrl,
                html,
                htmlFixture: body.html ? html : undefined,
                ...(directoryMerchant ? { directoryMerchant } : {}),
              });
              pageExtraction = applyDeterministicFieldFallback(pageExtraction, html, parsedUrl.href);
              title = pageExtraction.identity.title.value || title;
              brand = pageExtraction.identity.brand.value || brand;
              description = pageExtraction.content.description.value || description;
              price = pageExtraction.pricing.priceRupees.value ?? price;
              mrp = pageExtraction.pricing.mrpRupees.value ?? mrp;
              if (pageExtraction.media.primaryImageUrl.value) imagesSet.add(pageExtraction.media.primaryImageUrl.value);
              for (const image of pageExtraction.media.additionalImageUrls.value || []) {
                if (image) imagesSet.add(image);
              }
              const pageTaxonomy = await matchCategoryAndMerchant(db, pageExtraction);
              inferredCategoryId = pageTaxonomy.categoryId || inferredCategoryId;
            }
          } catch (error) {
            console.warn("Shared extraction rules failed during HTML review:", error);
          }
        }

        const images = Array.from(imagesSet);
        const imageUrl = images[0] || "";

        let mediaId = "";
        if (body.importImage && imageUrl) {
          const imp = await importProductImageFromUrl(imageUrl, title || "Product", actor.id);
          if (imp) mediaId = imp.mediaId;
        }

        return json({
          data: {
            html: html.slice(0, 500_000),
            url: targetUrl,
            extracted: {
              title,
              brand,
              description,
              sellingPrice: price != null ? String(price) : "",
              mrp: mrp != null ? String(mrp) : "",
              categoryId: inferredCategoryId,
              imageUrl,
              images,
              mediaId,
            },
            status: html ? "SUCCESS" : "NO_HTML",
          },
        });
      }

      if (request.method === "POST" && !id) {
        const body = (await readJson(request)) as { url?: string; importImage?: boolean };
        if (!body.url || typeof body.url !== "string") throw new DealError("Product URL is required.", 400);
        return json({
          data: await productExtractionService.extractProduct({
            url: body.url,
            importImage: body.importImage ?? false,
            actorId: actor.id,
          }),
        });
      }
      throw new DealError("Product extraction endpoint not found.", 404);
    }
    if ((resource === "categories" || resource === "merchants") && !action) {
      if (request.method === "GET") return json({ data: await (resource === "categories" ? db.category.findMany({ take: 500, orderBy: { name: "asc" } }) : db.merchant.findMany({ take: 500, orderBy: { name: "asc" }, select: merchantSelect })) });
      if (request.method === "POST" || request.method === "PUT") { const body = await readJson(request); return json({ data: await db.$transaction((tx) => saveTaxonomy(tx, actor, resource, body, id), { isolationLevel: "Serializable" }) }); }
      if (request.method === "DELETE" && id) {
        if (resource === "categories") {
          // Check if category has child subcategories or associated deals
          const childCount = await db.category.count({ where: { parentId: id } });
          if (childCount > 0) throw new DealError(`Cannot delete category with ${childCount} child subcategories. Reassign or delete them first.`, 409);
          const dealCount = await db.deal.count({ where: { categoryId: id } });
          if (dealCount > 0) {
            // Unlink or reassign to another category if any exist, or throw error
            const fallbackCat = await db.category.findFirst({ where: { id: { not: id } } });
            if (fallbackCat) {
              await db.deal.updateMany({ where: { categoryId: id }, data: { categoryId: fallbackCat.id } });
            } else {
              throw new DealError(`Cannot delete category: ${dealCount} deals are attached to it.`, 409);
            }
          }
          await db.category.delete({ where: { id } });
          return json({ success: true, message: "Category deleted successfully." });
        }
      }
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
    if (resource === "submissions") {
      const reviewer = { id: context.user.id, role: context.user.role };
      if (request.method === "GET" && id && action === "image") {
        const { bytes, mimeType } = await getSubmissionImage(reviewer, id);
        return new Response(new Uint8Array(bytes), { headers: { "Content-Type": mimeType, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" } });
      }
      if (request.method === "GET" && !id) {
        const params = new URL(request.url).searchParams;
        const status = z.enum(["PENDING_REVIEW", "APPROVED", "REJECTED"]).parse(params.get("status") ?? "PENDING_REVIEW");
        return json({ data: await listSubmissions(reviewer, status, z.coerce.number().int().min(1).max(10_000).parse(params.get("page") ?? 1)) });
      }
      if (request.method === "POST" && id && action === "approve") return json({ data: await approveSubmission(reviewer, id, await readJson(request)) });
      if (request.method === "POST" && id && action === "reject") return json({ data: await rejectSubmission(reviewer, id, await readJson(request)) });
      throw new DealError("Method not supported.", 405);
    }
    if (resource === "analytics" && request.method === "GET") {
      if (!id) return json({ data: await getUnifiedAnalyticsSummary(db, actor) });
      if (!roleCan(context.user.role, "operations:read")) throw new DealError("Permission denied.", 403);
      const url = new URL(request.url);
      const range = resolveRange(url.searchParams.get("range") ?? "7d", url.searchParams.get("from"), url.searchParams.get("to"));
      if (id === "live") return json({ data: await getLive() });
      if (id === "sessions") {
        if (action) return json({ data: await getSessionTimeline(action) });
        return json({ data: await listSessions(z.coerce.number().int().min(1).max(10_000).parse(url.searchParams.get("page") ?? 1)) });
      }
      if (id === "vendors") {
        return new Response(await vendorReport(range), {
          headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="vendor-report.csv"', "Cache-Control": "no-store" },
        });
      }
      if (id === "dashboard") return json({ data: await getDashboard(range) });
      throw new DealError("Unknown analytics report.", 404);
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
    if (resource === "cuelinks") {
      if (request.method === "GET") {
        const health = await cuelinksClient.checkHealth();
        const [totalDeals, monetizedDeals, totalClicks, transactionsSummary] = await Promise.all([
          db.deal.count({ where: { status: "PUBLISHED" } }),
          db.deal.count({ where: { status: "PUBLISHED", affiliateUrl: { not: null } } }),
          db.affiliateClick.count(),
          db.affiliateTransaction.aggregate({
            _count: { id: true },
            _sum: { commissionMinor: true },
          }),
        ]);

        let campaigns: unknown[] = [];
        let offers: unknown[] = [];
        if (cuelinksClient.isConfigured()) {
          try {
            const [cList, oList] = await Promise.all([
              cuelinksClient.searchCampaigns(),
              cuelinksClient.getOffers(),
            ]);
            campaigns = cList.campaigns;
            offers = oList;
          } catch {
            // Keep empty arrays if API call fails
          }
        }

        return json({
          data: {
            health,
            stats: {
              totalDeals,
              monetizedDeals,
              unmonetizedDeals: totalDeals - monetizedDeals,
              monetizationRate: totalDeals > 0 ? Math.round((monetizedDeals / totalDeals) * 100) : 0,
              totalClicks,
              totalTransactions: transactionsSummary._count.id || 0,
              totalEarningsPaise: transactionsSummary._sum.commissionMinor || 0,
            },
            campaigns,
            offers,
          },
        });
      }

      if (request.method === "POST") {
        const body = (await readJson(request)) as {
          action?: string;
          url?: string;
          subId?: string;
        };

        if (body.action === "convert" || body.action === "test_convert") {
          if (!body.url || typeof body.url !== "string") {
            throw new DealError("Target URL is required for conversion.", 400);
          }
          const result = await cuelinksClient.convertLink(body.url, body.subId);
          return json({ data: result });
        }

        if (body.action === "check_health") {
          const health = await cuelinksClient.checkHealth();
          return json({ data: { health } });
        }

        throw new DealError("Unknown Cuelinks action.", 400);
      }
      throw new DealError("Method not supported.", 405);
    }
    if (resource === "youtube") {
      if (id === "quota" && request.method === "GET") {
        const quota = await youTubeQuotaService.getQuotaStatus();
        return json({ data: quota });
      }
      if (id === "search" && request.method === "POST") {
        const body = (await readJson(request)) as { brand?: string; title?: string };
        const result = await youtubeReviewsService.searchTop20Videos(
          body.brand || "",
          body.title || "",
          { adminUserId: actor.id }
        );
        const quota = await youTubeQuotaService.getQuotaStatus();
        return json({ data: result.videos, status: result.status, message: result.message, quota });
      }
      throw new DealError("YouTube endpoint not found.", 404);
    }
    if (resource !== "deals") throw new DealError("Endpoint not found.", 404);
    if (id && action === "reviews") {
      if (request.method === "GET") {
        const reviews = await db.dealVideoReview.findMany({
          where: { dealId: id },
          orderBy: [{ isPinned: "desc" }, { rankingPosition: "asc" }],
        });
        return json({ data: reviews });
      }

      if (request.method === "POST") {
        const body = (await readJson(request)) as {
          operation?: "refresh" | "request" | "toggle_active" | "pin" | "delete" | "reorder" | "save_custom";
          reviewId?: string;
          isActive?: boolean;
          isPinned?: boolean;
          order?: string[];
          refresh?: boolean;
          videoUrls?: string[];
        };

        if (body.operation === "save_custom") {
          const result = await youtubeReviewsService.saveCustomVideosForDeal(
            id,
            body.videoUrls || [],
            { adminUserId: actor.id }
          );
          const updated = await db.dealVideoReview.findMany({
            where: { dealId: id },
            orderBy: [{ isPinned: "desc" }, { rankingPosition: "asc" }],
          });
          const updatedDeal = await db.deal.findUnique({
            where: { id },
            select: {
              id: true,
              youtubeReviewStatus: true,
              youtubeLastSearchedAt: true,
              _count: { select: { videoReviews: { where: { isActive: true } } } },
            },
          });
          return json({ data: updated, result, deal: updatedDeal });
        }

        if (body.operation === "refresh" || body.operation === "request") {
          const deal = await db.deal.findUnique({ where: { id } });
          if (!deal) throw new DealError("Deal not found.", 404);
          const result = await youtubeReviewsService.discoverAndStoreReviews(
            {
              id: deal.id,
              brand: deal.brand,
              title: deal.title,
            },
            {
              refresh: body.operation === "refresh" || Boolean(body.refresh),
              adminUserId: actor.id,
            }
          );
          const updated = await db.dealVideoReview.findMany({
            where: { dealId: id },
            orderBy: [{ isPinned: "desc" }, { rankingPosition: "asc" }],
          });
          const updatedDeal = await db.deal.findUnique({
            where: { id },
            select: {
              id: true,
              youtubeReviewStatus: true,
              youtubeLastSearchedAt: true,
              _count: { select: { videoReviews: { where: { isActive: true } } } },
            },
          });
          const quota = await youTubeQuotaService.getQuotaStatus();
          return json({ data: updated, result, deal: updatedDeal, quota });
        }

        if (body.operation === "toggle_active" && body.reviewId) {
          const updated = await db.dealVideoReview.update({
            where: { id: body.reviewId },
            data: { isActive: Boolean(body.isActive) },
          });
          return json({ data: updated });
        }

        if (body.operation === "pin" && body.reviewId) {
          const updated = await db.dealVideoReview.update({
            where: { id: body.reviewId },
            data: { isPinned: Boolean(body.isPinned) },
          });
          return json({ data: updated });
        }

        if (body.operation === "delete" && body.reviewId) {
          await db.dealVideoReview.delete({ where: { id: body.reviewId } });
          return json({ data: { success: true } });
        }

        if (body.operation === "reorder" && Array.isArray(body.order)) {
          for (let i = 0; i < body.order.length; i++) {
            await db.dealVideoReview.update({
              where: { id: body.order[i] },
              data: { rankingPosition: i + 1 },
            });
          }
          const updated = await db.dealVideoReview.findMany({
            where: { dealId: id },
            orderBy: [{ isPinned: "desc" }, { rankingPosition: "asc" }],
          });
          return json({ data: updated });
        }

        throw new DealError("Unsupported reviews operation.", 400);
      }
      throw new DealError("Method not supported.", 405);
    }
    if (request.method === "GET") {
      if (id) return json({ data: await getAdminDeal(db, id) });
      const page = z.coerce.number().int().min(1).max(1000).parse(new URL(request.url).searchParams.get("page") ?? 1);
      return json({ data: await db.deal.findMany({ take: 50, skip: (page - 1) * 50, orderBy: { updatedAt: "desc" }, include: dealInclude }), page });
    }
    const body = await readJson(request);
    if (id && action === "preview" && request.method === "POST") { const deal = await getAdminDeal(db, id); return json({ data: deal, previewToken: previewToken(actor.id, id, deal.version) }); }
    if (id && (action === "publish" || action === "archive" || request.method === "DELETE")) {
      const input = z.object({ version: z.number().int().positive(), previewToken: z.string().max(2000).optional() }).parse(body);
      const changed = await db.$transaction((tx) => changeDealState(tx, actor, id, request.method === "DELETE" ? "delete" : action as "publish" | "archive", input.version, input.previewToken));
      if (action === "publish" && request.method !== "DELETE") await autoPostToTelegram(db, actor, id);
      return json({ data: changed });
    }
    if ((!id && request.method === "POST") || (id && request.method === "PUT")) {
      const input = z.object({ deal: z.unknown(), version: z.number().int().positive().optional() }).parse(body);
      return json({ data: await db.$transaction((tx) => saveDeal(tx, actor, input.deal, id, input.version)) }, id ? 200 : 201);
    }
    throw new DealError("Method not supported.", 405);
  });
}
export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
