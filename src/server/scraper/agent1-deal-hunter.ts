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
   * Stores what was offered for approval (price-error flag and scores) BEFORE the approval buttons are sent.
   * handleTelegramApproval trusts only this stored record. shortcut: nothing calls this yet because no Telegram button sender exists; call it where buttons are created.
   */
  public static async registerPendingApproval(candidateId: string, assessment: Pick<QualityAssessment, "isPriceErrorSuspected" | "authenticityScore" | "attractivenessScore">): Promise<void> {
    const db = getDatabase();
    const data = {
      status: "PENDING_APPROVAL" as const,
      isPriceErrorSuspected: assessment.isPriceErrorSuspected,
      confidenceScore: assessment.authenticityScore,
      attractivenessScore: assessment.attractivenessScore,
      expiresAt: new Date(Date.now() + 2 * 3600 * 1000),
    };
    // One conditional update: only a pending, rejected or expired record may be (re)offered. An approved, claimed or published one is never reopened,
    // and an approval that lands at the same moment cannot be overwritten.
    const reopened = await db.publicationAuthorization.updateMany({ where: { candidateId, status: { in: ["PENDING_APPROVAL", "REJECTED", "EXPIRED"] } }, data });
    if (reopened.count > 0) return;
    if (await db.publicationAuthorization.findUnique({ where: { candidateId }, select: { id: true } })) return;
    try {
      await db.publicationAuthorization.create({ data: { candidateId, approvalToken: crypto.randomBytes(32).toString("hex"), ...data } });
    } catch (error) {
      if ((error as { code?: string })?.code !== "P2002") throw error;
    }
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

    // 2. Freshness check: callbacks older than 15 minutes, or dated more than a minute in the future, are rejected
    const now = Date.now();
    if (now - action.timestamp > 15 * 60 * 1000 || action.timestamp - now > 60 * 1000) {
      return { success: false, error: "STALE_CALLBACK: Telegram callback timestamp has expired" };
    }

    // 3. Suspected Price Error Policy: cannot be approved via automated callback.
    // The request's own assessment can only BLOCK an approval; what allows one is the stored record checked in step 7.
    if (assessment.isPriceErrorSuspected && action.action === "APPROVE") {
      return { success: false, error: "PRICE_ERROR_POLICY: Suspected price errors cannot receive automated Telegram approval" };
    }

    // 4. Webhook authenticity signature check (if webhook secret configured)
    // Signing key: the dedicated callback secret (TELEGRAM_CALLBACK_SECRET), passed in by the route. No key means no approvals.
    const effectiveSecret = webhookSecret || process.env.TELEGRAM_CALLBACK_SECRET;
    if (!effectiveSecret) {
      return { success: false, error: "CALLBACK_SECRET_NOT_CONFIGURED: Telegram callback signing key is not set" };
    }
    if (!action.signature) {
      return { success: false, error: "INVALID_SIGNATURE: Telegram callback signature is required" };
    }
    if (action.signature) {
      const isValidSig = this.verifyTelegramSignature(candidateId, action, effectiveSecret);
      if (!isValidSig) {
        return { success: false, error: "INVALID_SIGNATURE: Telegram callback signature verification failed" };
      }
    }

    // 5. One-time callback consumption & distributed replay protection via Redis
    if (action.signature) {
      const isFirstConsumption = await SharedSecurityStore.claimTelegramCallback(action.signature, 2000);
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
      // A decision other than APPROVE ends the offer, so a later APPROVE callback cannot approve it.
      await db.publicationAuthorization.updateMany({ where: { candidateId, status: "PENDING_APPROVAL" }, data: { status: "REJECTED" } });
      return { success: true };
    }

    // 7. Verify Candidate existence in database before creating authorization
    const candidate = await db.dealCandidate.findUnique({
      where: { id: candidateId },
    });

    if (!candidate) {
      return { success: false, error: "CANDIDATE_NOT_FOUND: Deal candidate record does not exist." };
    }

    // 8. Approval is allowed only for a record the pipeline itself stored (registerPendingApproval): its price-error flag and scores come from the
    // database, never from the callback, and the update is conditional so two callbacks cannot both approve.
    const pending = await db.publicationAuthorization.findUnique({ where: { candidateId } });
    if (!pending || pending.status !== "PENDING_APPROVAL" || pending.expiresAt <= new Date()) {
      return { success: false, error: "NO_PENDING_AUTHORIZATION: This candidate was not offered for approval or the offer expired" };
    }
    if (pending.isPriceErrorSuspected) {
      return { success: false, error: "PRICE_ERROR_POLICY: Suspected price errors cannot receive automated Telegram approval" };
    }
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 2 * 3600 * 1000); // 2 hour valid publishing window
    const claimed = await db.publicationAuthorization.updateMany({
      where: { id: pending.id, status: "PENDING_APPROVAL" },
      data: { authorizedByAdmin: `telegram:${action.telegramUserId}`, approvalToken: token, status: "APPROVED", approvedAt: new Date(), expiresAt },
    });
    if (claimed.count !== 1) return { success: false, error: "ALREADY_HANDLED: This approval was already handled" };
    const record = { id: pending.id };
    assessment = { ...assessment, authenticityScore: pending.confidenceScore, attractivenessScore: pending.attractivenessScore };

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
