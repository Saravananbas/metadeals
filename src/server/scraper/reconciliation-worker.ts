import { getDatabase } from "@/server/db/client";
import { logger } from "@/server/logging/logger";
import { writeAudit } from "@/server/auth/audit";

export interface ReconciliationResult {
  scanned: number;
  recovered: number;
  markedFailed: number;
}

export class PublishingReconciliationWorker {
  /**
   * Scans for dangling authorizations stuck in CLAIMED or PUBLISHING for more than 5 minutes.
   * If a Deal was successfully created in PostgreSQL, it promotes the authorization to PUBLISHED.
   * If no Deal was created and the timeout has lapsed, it marks it RECOVERY_REQUIRED.
   */
  public static async reconcileStaleAuthorizations(timeoutMs = 5 * 60 * 1000): Promise<ReconciliationResult> {
    const db = getDatabase();
    const cutoff = new Date(Date.now() - timeoutMs);

    const staleAuths = await db.publicationAuthorization.findMany({
      where: {
        status: { in: ["CLAIMED", "PUBLISHING"] },
        createdAt: { lte: cutoff },
      },
    });

    let recovered = 0;
    let markedFailed = 0;

    for (const auth of staleAuths) {
      try {
        const candidate = await db.dealCandidate.findUnique({
          where: { id: auth.candidateId },
          include: { deal: true },
        });

        if (candidate?.deal && candidate.status === "PUBLISHED") {
          // Interrupted after deal creation but before authorization status was marked PUBLISHED
          await db.publicationAuthorization.update({
            where: { id: auth.id },
            data: {
              status: "PUBLISHED",
              publishedAt: candidate.deal.publishedAt || new Date(),
            },
          });
          recovered++;
          logger.info({ authId: auth.id, dealId: candidate.deal.id }, "Reconciled interrupted authorization to PUBLISHED");
          await writeAudit({
            action: "RECONCILIATION_AUTH_RECOVERED",
            targetId: auth.id,
            success: true,
            metadata: { dealId: candidate.deal.id, candidateId: auth.candidateId },
          });
        } else {
          // Interrupted before deal creation, or publish crashed
          await db.publicationAuthorization.update({
            where: { id: auth.id },
            data: { status: "RECOVERY_REQUIRED" },
          });
          markedFailed++;
          logger.warn({ authId: auth.id }, "Marked interrupted authorization as RECOVERY_REQUIRED");
          await writeAudit({
            action: "RECONCILIATION_AUTH_FAILED",
            targetId: auth.id,
            success: false,
            metadata: { candidateId: auth.candidateId },
          });
        }
      } catch (err) {
        logger.error({ authId: auth.id, error: (err as Error).message }, "Error during individual authorization reconciliation");
      }
    }

    return {
      scanned: staleAuths.length,
      recovered,
      markedFailed,
    };
  }
}

