import { SharedSecurityStore } from "@/server/queue/security-store";
import { getDatabase } from "@/server/db/client";
import { publishVerifiedCandidate } from "./publishing";
import { writeAudit } from "@/server/auth/audit";

export interface PublishingPreflightRequest {
  candidateId: string;
  authorizationToken: string;
  callerIdentity?: {
    role: "AGENT_1" | "SUPER_ADMIN" | "ADMIN" | "AGENT_3";
    userId?: string;
  };
  /** Deprecated alias maintained for backward compatibility only */
  callerAgent?: "AGENT_1" | "AGENT_3" | "MANUAL_ADMIN";
}

export interface PublishingResult {
  published: boolean;
  dealId?: string;
  slug?: string;
  error?: string;
}

export class Agent2PublishingEngine {
  private static globalPublishingKillSwitch = false;

  /**
   * Toggles the central emergency publishing kill-switch in shared Redis infrastructure
   * and synchronizes the local instance state.
   */
  public static setKillSwitch(active: boolean): void {
    Agent2PublishingEngine.globalPublishingKillSwitch = active;
    void SharedSecurityStore.setKillSwitch(active).catch(() => {});
  }

  public static isKillSwitchActive(): boolean {
    return Agent2PublishingEngine.globalPublishingKillSwitch;
  }

  /**
   * Central gatekeeper: ONLY point of publication for deal candidates.
   * Enforces atomic single-use state transitions and comprehensive pre-flight verification.
   */
  public static async publishCandidate(
    request: PublishingPreflightRequest
  ): Promise<PublishingResult> {
    // 1. Resolve & Enforce Caller Identity (Do not trust callerAgent input)
    const effectiveRole = request.callerIdentity
      ? request.callerIdentity.role
      : request.callerAgent === "AGENT_3"
      ? "AGENT_3"
      : "AGENT_1";

    // 2. Strict Agent 3 Shadow Isolation Gate
    if (effectiveRole === "AGENT_3" || request.callerAgent === "AGENT_3") {
      try {
        await writeAudit({
          action: "AGENT_3_PUBLISH_BLOCKED",
          targetId: request.candidateId,
          success: false,
          metadata: { reason: "Agent 3 attempted to publish in shadow mode" },
        });
      } catch {
        // Non-blocking audit
      }
      return {
        published: false,
        error: "AGENT_3_SHADOW_RESTRICTION: Agent 3 is in shadow mode and cannot invoke the publishing engine.",
      };
    }

    // 3. Shared Infrastructure Kill Switch Gate (evaluated immediately before processing)
    const isKilled = Agent2PublishingEngine.globalPublishingKillSwitch || (await SharedSecurityStore.isKillSwitchActive());
    if (isKilled) {
      try {
        await writeAudit({
          action: "DEAL_PUBLISH_BLOCKED_KILL_SWITCH",
          targetId: request.candidateId,
          success: false,
          metadata: { reason: "Kill switch active" },
        });
      } catch {
        // Non-blocking audit
      }
      return { published: false, error: "KILL_SWITCH_ACTIVE: Global publishing kill-switch is engaged." };
    }

    const db = getDatabase();

    // 4. Atomic Authorization Check & State Transition (APPROVED -> CLAIMED -> PUBLISHING -> PUBLISHED)
    const existingAuth = await db.publicationAuthorization.findUnique({
      where: { candidateId: request.candidateId },
    });

    if (!existingAuth) {
      return { published: false, error: "AUTHORIZATION_NOT_FOUND: No persistent publication authorization exists." };
    }

    if (existingAuth.approvalToken !== request.authorizationToken) {
      return { published: false, error: "INVALID_TOKEN: Cryptographic approval token does not match." };
    }

    if (existingAuth.expiresAt < new Date()) {
      await db.publicationAuthorization.updateMany({
        where: { id: existingAuth.id, status: "APPROVED" },
        data: { status: "EXPIRED" },
      });
      return { published: false, error: "AUTHORIZATION_EXPIRED: The publication window for this candidate has lapsed." };
    }

    if (existingAuth.isPriceErrorSuspected) {
      return { published: false, error: "PRICE_ERROR_HOLD: Suspected price errors cannot be published." };
    }

    // Atomic Conditional Claim: Exactly one concurrent process will update status from APPROVED to CLAIMED
    const claimed = await db.publicationAuthorization.updateMany({
      where: {
        id: existingAuth.id,
        status: "APPROVED",
        expiresAt: { gt: new Date() },
      },
      data: {
        status: "CLAIMED",
      },
    });

    if (claimed.count === 0) {
      return {
        published: false,
        error: `INVALID_AUTH_STATUS: Authorization status is ${existingAuth.status}, expected APPROVED (already claimed or published).`,
      };
    }

    // Transition CLAIMED -> PUBLISHING
    await db.publicationAuthorization.update({
      where: { id: existingAuth.id },
      data: { status: "PUBLISHING" },
    });

    const auth = existingAuth;

    // 5. Fetch and Validate Deal Candidate Freshness & Stock
    const candidate = await db.dealCandidate.findUnique({
      where: { id: request.candidateId },
      include: { deal: true },
    });

    if (!candidate) {
      return { published: false, error: "CANDIDATE_NOT_FOUND: Deal candidate record does not exist." };
    }

    // Concurrency / Idempotency protection: Check if deal is already published
    if (candidate.status === "PUBLISHED" && candidate.deal) {
      return {
        published: true,
        dealId: candidate.deal.id,
        slug: candidate.deal.slug,
      };
    }

    // Pre-flight Freshness & Stock Gates
    if (!candidate.inStock) {
      return { published: false, error: "PRODUCT_UNAVAILABLE: Product is not confirmed in stock." };
    }

    if (candidate.observedPriceMinor <= 0 || candidate.observedMrpMinor <= 0) {
      return { published: false, error: "PRICE_MISMATCH: Candidate has invalid non-positive price values." };
    }

    if (candidate.observedPriceMinor >= candidate.observedMrpMinor) {
      return { published: false, error: "PRICE_MISMATCH: Selling price cannot equal or exceed MRP." };
    }

    // 6. Execute Atomic Publishing via V1 Publisher in a database transaction
    try {
      const publishResult = await publishVerifiedCandidate(db, candidate.id);

      // 7. Atomic Transition to PUBLISHED
      await db.publicationAuthorization.update({
        where: { id: auth.id },
        data: {
          status: "PUBLISHED",
          publishedAt: new Date(),
        },
      });

      // 8. Record audit log for successful publishing
      try {
        await writeAudit({
          action: "DEAL_PUBLISHED",
          targetId: publishResult.id,
          success: true,
          metadata: {
            candidateId: candidate.id,
            slug: publishResult.slug,
            priceMinor: candidate.observedPriceMinor,
          },
        });
      } catch {
        // Non-blocking
      }

      return {
        published: true,
        dealId: publishResult.id,
        slug: publishResult.slug,
      };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Publishing execution failed";
      try {
        await writeAudit({
          action: "DEAL_PUBLISH_FAILED",
          targetId: candidate.id,
          success: false,
          metadata: { error: errorMessage },
        });
      } catch {
        // Non-blocking
      }
      return { published: false, error: `PUBLISHING_FAILED: ${errorMessage}` };
    }
  }
}
