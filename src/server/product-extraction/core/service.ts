import "server-only";
import { getDatabase } from "@/server/db/client";
import { DealError } from "@/server/deals/service";
import { validateProductUrl } from "../security/url-validator";
import { safeFetchText } from "../security/fetch-policy";
import { adapterRegistry } from "./registry";
import { matchCategoryAndMerchant, buildSuggestedFormValues } from "./normalizer";
import { importProductImageFromUrl } from "../media/image-import";
import { createField } from "./confidence";
import type {
  ProductExtractionResult,
  ExtractionStatus,
  ExtractionDiagnostics,
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
    const validated = validateProductUrl(options.url);
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
    const adapter = adapterRegistry.findAdapterForUrl(validated.url);
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

    // 3. Check authorization status
    const authInfo = await adapter.checkAuthorization();
    if (!authInfo.authorized && !options.htmlFixture) {
      warnings.push(
        authInfo.reason ??
          `${adapter.name} automated page scraping is restricted. Basic identity attributes were extracted from URL; price must be confirmed manually.`
      );
    }

    // 4. Retrieve page HTML safely where permitted or available
    let htmlContent: string | undefined = options.htmlFixture;
    if (!htmlContent) {
      try {
        const fetched = await safeFetchText(validated.url.toString(), {
          timeoutMs: 5000,
          maxBytes: 2 * 1024 * 1024,
        });
        if (fetched.text && fetched.text.length > 50) {
          htmlContent = fetched.text;
        }
      } catch (fetchErr) {
        const reason = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        warnings.push(`Automated HTML fetch for ${validated.hostname} was restricted or unavailable (${reason}). Extracted metadata from available sources.`);
      }
    }

    // 5. Run adapter extraction
    const extraction = await adapter.extract({
      url: validated.url,
      rawUrl: options.url,
      html: htmlContent,
      htmlFixture: options.htmlFixture,
      importImage: options.importImage,
      userId: options.actorId,
    });

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
    if (!matchedTaxonomy.merchantId) {
      warnings.push(`Primary merchant "${adapter.name}" was not found in the database.`);
    }

    // 7. Check pricing status
    const hasPrice = extraction.pricing.priceMinor.value !== null;
    const hasMrp = extraction.pricing.mrpMinor.value !== null;

    if (!hasPrice) {
      warnings.push("Current selling price could not be automatically verified. Please enter the deal price in ₹.");
    }
    if (!hasMrp) {
      warnings.push("MRP could not be automatically verified. Please enter the MRP in ₹.");
    }

    // 8. Determine overall extraction status
    let status: ExtractionStatus = "FULL_SUCCESS";
    if (authInfo.status === "AUTHORIZATION_REQUIRED" && !hasPrice && !options.htmlFixture) {
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
      extractionMethodUsed: authInfo.primaryMethod,
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
      sourceMethod: authInfo.primaryMethod,
      summary: {
        title: extraction.identity.title.value,
        brand: extraction.identity.brand.value,
        priceMinor: extraction.pricing.priceMinor.value,
        mrpMinor: extraction.pricing.mrpMinor.value,
        hasImage: !!extraction.media.primaryImageUrl.value,
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
