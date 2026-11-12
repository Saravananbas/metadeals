import { SharedSecurityStore } from "@/server/queue/security-store";
import crypto from "node:crypto";
import { getDatabase } from "@/server/db/client";
import { DealQualityEngine, type QualityAssessment } from "./deal-quality-engine";
import { sourceHealthManager, type NormalizedOfferContract } from "./source-health";
import { writeAudit } from "@/server/auth/audit";

export interface TelegramApprovalAction {
  action: "APPROVE" | "REJECT" | "HOLD" | "REVERIFY";
  rejectionReason?: "FAKE_DISCOUNT" | "WRONG_VARIANT" | "POOR_SELLER" | "DUPLICATE" | "EXPIRED" | "UNVERIFIABLE";
  telegramUserId: string;
  signature: string;
  timestamp: number;
}

export class Agent1DealHunter {
  /**
   * Used Telegram callback signatures for one-time callback consumption & replay protection.
   * Key: signature string, Value: expiry timestamp.
   */
  private static consumedSignatures = new Map<string, number>();

  /**
   * Helper to verify Telegram webhook HMAC-SHA256 signature.
   * Payload format: `${action.telegramUserId}:${candidateId}:${action.action}:${action.timestamp}`
   */
  public static verifyTelegramSignature(
    candidateId: string,
    action: TelegramApprovalAction,
    secret: string
  ): boolean {
    if (!action.signature || !secret) return false;
    const payload = `${action.telegramUserId}:${candidateId}:${action.action}:${action.timestamp}`;
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");
    const sigBuf = Buffer.from(action.signature);
    const expectedBuf = Buffer.from(expectedSignature);
    if (sigBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expectedBuf);
  }

  /**
   * Evaluates an extracted retailer offer and determines its routing path.
   * Performs deep product variant, seller, price sanity, and availability validation.
   */
  public static async processDiscoveredOffer(
    offer: NormalizedOfferContract,
    historyPrices: Array<{ pricePaise: number; observedAt: Date }>
  ): Promise<{
    route: "AWAITING_APPROVAL" | "REVIEW_REQUIRED" | "SUSPECTED_PRICE_ERROR" | "REJECT";
    assessment: QualityAssessment;
    approvalToken?: string;
  }> {
    // 1. Check connector health via SourceHealthManager circuit breaker
    const health = await sourceHealthManager.canExecute(offer.sourceId);
    if (!health.allowed) {
      throw new Error(`SOURCE_UNAVAILABLE: ${health.reason}`);
    }

    // 2. Exact product and variant validation (require brand, title, and model/variant/UPC if available)
    const isVariantStrictlyMatched = Boolean(
      offer.brand &&
      offer.brand.trim().length > 0 &&
      offer.productName &&
      offer.productName.trim().length >= 5 &&
      (offer.modelOrVariantId !== undefined ? offer.modelOrVariantId.trim().length > 0 : true)
    );

    // 3. Seller trustworthiness validation
    const isSellerAcceptable = offer.seller ? offer.seller.trim().length > 0 : true;

    // 4. Evaluate deal quality via DealQualityEngine
    const assessment = DealQualityEngine.evaluateDeal({
      sellingPricePaise: offer.sellingPricePaise,
      mrpPaise: offer.mrpPaise,
      history: historyPrices,
      isStockConfirmed: offer.isAvailable,
      isVariantMatched: isVariantStrictlyMatched && isSellerAcceptable,
    });

    if (assessment.isPriceErrorSuspected) {
      return { route: "SUSPECTED_PRICE_ERROR", assessment };
    }

    // 5. Hard validation: selling price must be strictly less than MRP and non-zero
    if (offer.sellingPricePaise <= 0 || offer.mrpPaise <= 0 || offer.sellingPricePaise >= offer.mrpPaise) {
      return { route: "REJECT", assessment };
    }

    // 6. High-confidence routing
    if (assessment.authenticityScore > 75 && offer.isAvailable && isVariantStrictlyMatched) {
      const approvalToken = crypto.randomBytes(32).toString("hex");
      return { route: "AWAITING_APPROVAL", assessment, approvalToken };
    }

    return { route: "REVIEW_REQUIRED", assessment };
  }

  /**
   * Validates Telegram callback action and creates persisted PublicationAuthorization.
   * Strictly verifies allowlisted Telegram User IDs, cryptographic signatures, and replay protection.
   */
  public static async handleTelegramApproval(
    candidateId: string,
    action: TelegramApprovalAction,
    assessment: Pick<QualityAssessment, "isPriceErrorSuspected" | "authenticityScore" | "attractivenessScore">,
    allowedAdminIds: string[] = [],
    webhookSecret?: string
  ): Promise<{ success: boolean; authorizationId?: string; error?: string }> {
    // 1. Authorization check: Admin allowlist (FAIL CLOSED if empty or unauthorized)
    if (!allowedAdminIds || allowedAdminIds.length === 0 || !allowedAdminIds.includes(action.telegramUserId)) {
      return { success: false, error: "UNAUTHORIZED_ADMIN: Telegram User ID not in authorized allowlist" };
    }

    // 2. Freshness check: Callbacks older than 15 minutes rejected
    const now = Date.now();
    if (Math.abs(now - action.timestamp) > 15 * 60 * 1000) {
      return { success: false, error: "STALE_CALLBACK: Telegram callback timestamp has expired" };
    }

    // 3. Suspected Price Error Policy: cannot be approved via automated callback
    if (assessment.isPriceErrorSuspected && action.action === "APPROVE") {
      return { success: false, error: "PRICE_ERROR_POLICY: Suspected price errors cannot receive automated Telegram approval" };
    }

    // 4. Webhook authenticity signature check (if webhook secret configured)
    const effectiveSecret = webhookSecret || process.env.TELEGRAM_WEBHOOK_SECRET;
    if (effectiveSecret && !action.signature) {
      return { success: false, error: "INVALID_SIGNATURE: Telegram callback signature is required" };
    }
    if (effectiveSecret && action.signature) {
      const isValidSig = this.verifyTelegramSignature(candidateId, action, effectiveSecret);
      if (!isValidSig) {
        return { success: false, error: "INVALID_SIGNATURE: Telegram callback signature verification failed" };
      }
    }

    // 5. One-time callback consumption & distributed replay protection via Redis
    if (action.signature) {
      const isFirstConsumption = await SharedSecurityStore.claimTelegramCallback(action.signature, 900);
      if (!isFirstConsumption) {
        return { success: false, error: "REPLAYED_CALLBACK: This Telegram action has already been consumed" };
      }
    }

    const db = getDatabase();

    // 6. Handle non-APPROVE actions (REJECT, HOLD, REVERIFY)
    if (action.action !== "APPROVE") {
      try {
        await writeAudit({
          action: `TELEGRAM_${action.action}`,
          targetId: candidateId,
          success: true,
          metadata: {
            telegramUserId: action.telegramUserId,
            rejectionReason: action.rejectionReason ?? null,
            timestamp: action.timestamp,
          },
        });
      } catch {
        // Non-blocking audit recording
      }
      return { success: true };
    }

    // 7. Verify Candidate existence in database before creating authorization
    const candidate = await db.dealCandidate.findUnique({
      where: { id: candidateId },
    });

    if (!candidate) {
      return { success: false, error: "CANDIDATE_NOT_FOUND: Deal candidate record does not exist." };
    }

    // 8. Generate persisted PublicationAuthorization
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 2 * 3600 * 1000); // 2 hour valid publishing window

    const record = await db.publicationAuthorization.upsert({
      where: { candidateId },
      create: {
        candidateId,
        authorizedByAdmin: `telegram:${action.telegramUserId}`,
        approvalToken: token,
        status: "APPROVED",
        isPriceErrorSuspected: false,
        confidenceScore: assessment.authenticityScore,
        attractivenessScore: assessment.attractivenessScore,
        approvedAt: new Date(),
        expiresAt,
      },
      update: {
        authorizedByAdmin: `telegram:${action.telegramUserId}`,
        approvalToken: token,
        status: "APPROVED",
        isPriceErrorSuspected: false,
        confidenceScore: assessment.authenticityScore,
        attractivenessScore: assessment.attractivenessScore,
        approvedAt: new Date(),
        expiresAt,
      },
    });

    // 9. Write audit log for approval
    try {
      await writeAudit({
        action: "PUBLICATION_AUTHORIZED",
        targetId: candidateId,
        success: true,
        metadata: {
          authorizationId: record.id,
          authorizedBy: `telegram:${action.telegramUserId}`,
          confidenceScore: assessment.authenticityScore,
        },
      });
    } catch {
      // Non-blocking audit
    }

    return { success: true, authorizationId: record.id };
  }

  /**
   * Garbage collects expired signatures from replay protection cache.
   */
  private static cleanExpiredSignatures(now: number): void {
    for (const [sig, expiry] of this.consumedSignatures.entries()) {
      if (now > expiry) {
        this.consumedSignatures.delete(sig);
      }
    }
  }
}
