import "server-only";
import { getDatabase } from "@/server/db/client";
import { DealError } from "@/server/deals/service";
import { validateProductUrl } from "../security/url-validator";
import { adapterRegistry } from "./registry";
import { matchCategoryAndMerchant, buildSuggestedFormValues } from "./normalizer";
import { importProductImageFromUrl } from "../media/image-import";
import { findActiveDirectoryMerchantForUrl } from "./merchant-directory-match";
import { findAllowedDomain } from "../security/domain-allowlist";
import { applyDeterministicFieldFallback } from "./strategy-engine";
import { safeFetchText } from "../security/fetch-policy";
import { createField } from "./confidence";
import { fetchPythonProduct, normalizePythonProduct } from "./python-engine";
import type {
  ProductExtractionResult,
  ExtractionStatus,
  ExtractionDiagnostics,
  NormalizedProductExtraction,
} from "./types";

export interface ExtractProductOptions {
  url: string;
  importImage?: boolean;
  actorId?: string;
  htmlFixture?: string; // Used for tests and static fixtures
}

export class ProductExtractionService {
  async extractProduct(options: ExtractProductOptions): Promise<ProductExtractionResult> {
    const startTime = Date.now();
    const db = getDatabase();
    const warnings: string[] = [];
    const errors: string[] = [];

    // 1. Validate URL & SSRF
    let validated = validateProductUrl(options.url);
    let directoryMerchant: Awaited<ReturnType<typeof findActiveDirectoryMerchantForUrl>> = null;
    if (!validated.valid && validated.error?.startsWith("Retailer domain ")) {
      directoryMerchant = await findActiveDirectoryMerchantForUrl(db, options.url);
      if (directoryMerchant) validated = validateProductUrl(options.url, directoryMerchant);
    }
    if (!validated.valid || !validated.url) {
      const errorMsg = validated.error || "Invalid product URL.";
      await this.logExtractionAttempt({
        db,
        adminUserId: options.actorId,
        retailer: "Unknown",
        originalUrl: options.url,
        extractionStatus: "FAILED",
        sourceMethod: "validation",
        errorCode: "INVALID_URL",
        summary: { error: errorMsg },
      });
      throw new DealError(errorMsg, 400);
    }

    // 2. Discover adapter
    const adapter = adapterRegistry.findAdapterForUrl(validated.url) || (directoryMerchant
      ? adapterRegistry.getAdapterById("generic-structured-data")
      : undefined);
    if (!adapter) {
      const errorMsg = `No suitable retailer adapter found for domain: ${validated.hostname}`;
      await this.logExtractionAttempt({
        db,
        adminUserId: options.actorId,
        retailer: validated.retailerName ?? "Unknown",
        originalUrl: options.url,
        extractionStatus: "FAILED",
        sourceMethod: "registry",
        errorCode: "ADAPTER_NOT_FOUND",
        summary: { error: errorMsg },
      });
      throw new DealError(errorMsg, 400);
    }

    if (directoryMerchant && !findAllowedDomain(validated.hostname || "")) {
      warnings.push(`Merchant ${directoryMerchant.name} was matched from the active directory. No merchant-specific extraction configuration has been validated; verify extracted fields manually.`);
    }

    // 3. Check authorization status
    const authInfo = await adapter.checkAuthorization();
    if (!authInfo.authorized && !options.htmlFixture) {
      warnings.push(
        authInfo.reason ??
          `${adapter.name} automated page scraping is restricted. Basic identity attributes were extracted from URL; price must be confirmed manually.`
      );
    }

    // 4. Use the vendored deterministic Python engine for live, user-triggered
    // fetches. Its fetch layer enforces URL/redirect safety and reports access
    // restrictions without solving CAPTCHAs or bypassing challenges. Static
    // HTML fixtures keep the existing test adapter.
    let extraction: NormalizedProductExtraction;
    let extractionMethodUsed: string;
    if (!options.htmlFixture) {
      let pythonProduct: Awaited<ReturnType<typeof fetchPythonProduct>> | null = null;
      let pythonFailure = "";
      try {
        pythonProduct = await fetchPythonProduct(validated.url.href);
      } catch (error) {
        pythonFailure = error instanceof Error ? error.message : "Python extractor unavailable.";
      }
      if (!pythonProduct) {
        // No Python engine (e.g. shared hosting): fall back to the in-app Node pipeline; partial results are fine.
        try {
          const host = validated.url.hostname.replace(/^www\./, "");
          const { text, finalUrl } = await safeFetchText(validated.url.href, { allowedDomains: [host, `www.${host}`] });
          const base = await adapter.extract({
            url: validated.url,
            rawUrl: options.url,
            html: text,
            htmlFixture: text,
            importImage: options.importImage,
            userId: options.actorId,
            ...(directoryMerchant ? { directoryMerchant } : {}),
          });
          extraction = applyDeterministicFieldFallback(base, text, finalUrl);
          extractionMethodUsed = "node_pipeline";
          warnings.push("Fetched with the built-in extractor; some fields may be missing. Fill them in manually.");
        } catch (error) {
          const reason = `${pythonFailure} | ${error instanceof Error ? error.message : "Node fetch failed."}`;
          await this.logExtractionAttempt({
            db,
            adminUserId: options.actorId,
            retailer: adapter.name,
            originalUrl: options.url,
            extractionStatus: "FAILED",
            sourceMethod: "node_pipeline",
            errorCode: "EXTRACTOR_UNAVAILABLE",
            summary: { error: reason.slice(0, 300) },
          });
          throw new DealError(`Product extraction service is unavailable: ${reason}`, 503);
        }
      } else {
      const canonicalUrl = pythonProduct.product_url || validated.url.href;
      let finalUrlValidation = validateProductUrl(canonicalUrl);
      if (!finalUrlValidation.valid && directoryMerchant) {
        finalUrlValidation = validateProductUrl(canonicalUrl, directoryMerchant);
      }
      const finalHost = finalUrlValidation.url?.hostname.toLowerCase() || "";
      const retailerRedirectAllowed = finalUrlValidation.valid && (
        adapter.canHandle(finalUrlValidation.url!) ||
        Boolean(directoryMerchant && (finalHost === directoryMerchant.domain || finalHost.endsWith(`.${directoryMerchant.domain}`)))
      );
      if (!retailerRedirectAllowed || !finalUrlValidation.url) {
        throw new DealError("The extractor returned a final URL outside the selected retailer domain; result was rejected.", 502);
      }
      extraction = normalizePythonProduct(pythonProduct, {
        originalUrl: options.url,
        merchantName: directoryMerchant?.name || adapter.name,
        merchantSlug: adapter.slug,
        canonicalUrl,
      });
      warnings.push(...(pythonProduct.notes || []));
      extractionMethodUsed = `python:${(pythonProduct.extraction_method || ["deterministic_rules"]).join("+")}`;
      if (pythonProduct.extraction_status === "blocked") {
        warnings.push("The merchant page returned an access restriction. No bypass was attempted.");
      }
      }
    } else {
      // Fixture-only path; live page fetches use the in-repository Python engine.
      const htmlContent: string | undefined = options.htmlFixture;
      const fixtureOnlyAdapter = await adapter.extract({
        url: validated.url,
        rawUrl: options.url,
        html: htmlContent,
        htmlFixture: options.htmlFixture,
        importImage: options.importImage,
        userId: options.actorId,
        ...(directoryMerchant ? { directoryMerchant } : {}),
      });
      extraction = htmlContent
        ? applyDeterministicFieldFallback(fixtureOnlyAdapter, htmlContent, validated.url.href)
        : fixtureOnlyAdapter;
      extractionMethodUsed = options.htmlFixture ? "static_html_fixture" : authInfo.primaryMethod;
    }

    // 5. Image handling
    if (options.importImage && extraction.media.primaryImageUrl.value) {
      try {
        const altText = extraction.identity.title.value || "Product image";
        const imported = await importProductImageFromUrl(
          extraction.media.primaryImageUrl.value,
          altText,
          options.actorId
        );
        if (imported) {
          extraction.media.importedMediaId = createField(
            imported.mediaId,
            "approved_provider",
            "HIGH"
          );
          extraction.media.importedMediaUrl = imported.url;
        } else {
          warnings.push(
            "Could not automatically import the remote product image. Please upload a local image file."
          );
        }
      } catch {
        warnings.push("Remote product image processing failed. Manual image upload required.");
      }
    }

    // 6. Match taxonomy (category & merchant)
    const matchedTaxonomy = await matchCategoryAndMerchant(db, extraction);
    if (!matchedTaxonomy.categoryId) {
      warnings.push("Category could not be automatically matched. Please select a category manually.");
    }
    if (!matchedTaxonomy.merchantId && !matchedTaxonomy.merchantDirectoryId) {
      warnings.push(`Primary merchant "${adapter.name}" was not found in the database.`);
    }

    // 7. Check pricing status
    const hasPrice = extraction.pricing.priceMinor.value !== null;
    const hasMrp = extraction.pricing.mrpMinor.value !== null;
    const requiredFieldCoverage = {
      title: Boolean(extraction.identity.title.value?.trim()),
      image: Boolean(extraction.media.primaryImageUrl.value),
      sellingPrice: hasPrice,
      mrp: hasMrp,
      merchant: Boolean(matchedTaxonomy.merchantId || matchedTaxonomy.merchantDirectoryId),
      category: Boolean(matchedTaxonomy.categoryId),
    };

    if (!hasPrice) {
      warnings.push("Current selling price could not be automatically verified. Please enter the deal price in ₹.");
    }
    if (!hasMrp) {
      warnings.push("MRP could not be automatically verified. Please enter the MRP in ₹.");
    }

    // 8. Determine overall extraction status
    let status: ExtractionStatus = "FULL_SUCCESS";
    if (directoryMerchant && !findAllowedDomain(validated.hostname || "")) {
      status = "PARTIAL_SUCCESS";
    } else if (Object.values(requiredFieldCoverage).some((present) => !present)) {
      status = "PARTIAL_SUCCESS";
    } else if (authInfo.status === "AUTHORIZATION_REQUIRED" && !hasPrice && !options.htmlFixture) {
      status = "PARTIAL_SUCCESS";
    } else if (!hasPrice || !hasMrp) {
      status = "PARTIAL_SUCCESS";
    } else if (!authInfo.authorized) {
      status = "PARTIAL_SUCCESS";
    }

    // 9. Build suggested form values
    const suggestedFormValues = buildSuggestedFormValues(extraction, matchedTaxonomy);

    const diagnostics: ExtractionDiagnostics = {
      adapterId: adapter.id,
      adapterName: adapter.name,
      extractionMethodUsed,
      executionTimeMs: Date.now() - startTime,
      warnings,
      errors,
    };

    const result: ProductExtractionResult = {
      status,
      retailer: adapter.name,
      canonicalUrl: extraction.merchant.canonicalUrl,
      data: extraction,
      diagnostics,
      matchedTaxonomy,
      suggestedFormValues,
    };

    // 10. Audit logging
    await this.logExtractionAttempt({
      db,
      adminUserId: options.actorId,
      retailer: adapter.name,
      originalUrl: options.url,
      extractionStatus: status,
      sourceMethod: diagnostics.extractionMethodUsed,
      summary: {
        title: extraction.identity.title.value,
        brand: extraction.identity.brand.value,
        priceMinor: extraction.pricing.priceMinor.value,
        mrpMinor: extraction.pricing.mrpMinor.value,
        hasImage: !!extraction.media.primaryImageUrl.value,
        requiredFieldCoverage,
        fieldProvenance: {
          title: { source: extraction.identity.title.source, confidence: extraction.identity.title.confidence },
          image: { source: extraction.media.primaryImageUrl.source, confidence: extraction.media.primaryImageUrl.confidence },
          sellingPrice: { source: extraction.pricing.priceMinor.source, confidence: extraction.pricing.priceMinor.confidence },
          mrp: { source: extraction.pricing.mrpMinor.source, confidence: extraction.pricing.mrpMinor.confidence },
          category: { source: extraction.content.category.source, confidence: extraction.content.category.confidence },
        },
        additionalImageCount: extraction.media.additionalImageUrls.value?.length ?? 0,
        mappedMerchant: Boolean(matchedTaxonomy.merchantId),
        mappedCategory: Boolean(matchedTaxonomy.categoryId),
        warningsCount: warnings.length,
      },
    });

    return result;
  }

  private async logExtractionAttempt(params: {
    db: ReturnType<typeof getDatabase>;
    adminUserId?: string;
    retailer: string;
    originalUrl: string;
    extractionStatus: string;
    sourceMethod: string;
    errorCode?: string;
    summary?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await params.db.productExtractionLog.create({
        data: {
          adminUserId: params.adminUserId ?? null,
          retailer: params.retailer,
          originalUrl: params.originalUrl,
          extractionStatus: params.extractionStatus,
          sourceMethod: params.sourceMethod,
          errorCode: params.errorCode ?? null,
          fieldsSummary: (params.summary ?? {}) as import("@/generated/prisma/client").Prisma.InputJsonValue,
        },
      });

      if (params.adminUserId) {
        await params.db.auditEvent.create({
          data: {
            actorId: params.adminUserId,
            action: "product.extracted",
            targetId: params.retailer,
            success: params.extractionStatus !== "FAILED",
            metadata: {
              originalUrl: params.originalUrl,
              extractionStatus: params.extractionStatus,
              sourceMethod: params.sourceMethod,
            },
          },
        });
      }
    } catch (err) {
      console.warn("Failed to write extraction audit log:", err);
    }
  }
}

export const productExtractionService = new ProductExtractionService();
