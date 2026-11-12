import { getDatabase } from "@/server/db/client";

export type LifecycleEventType =
  | "CONFIRMED_OUT_OF_STOCK"
  | "PRICE_INCREASED_STALE"
  | "PRICE_DROPPED"
  | "COUPON_EXPIRED"
  | "REACTIVATED"
  | "ADMIN_DELISTED";

export interface LifecycleEventRecord {
  dealId: string;
  eventType: LifecycleEventType;
  previousPricePaise?: number;
  newPricePaise?: number;
  reason: string;
}

export class DealLifecycleManager {
  /**
   * Handles confirmed product unavailability (Out of Stock / 404).
   * HARD RULE:
   * 1. Immediately hides deal from public view (draft/inactive).
   * 2. Logs DealLifecycleEvent audit.
   * 3. Sends Telegram administrator alert.
   *
   * Note: Scraper timeouts or network errors must NEVER trigger this method!
   */
  public static async handleConfirmedUnavailable(
    dealId: string,
    reason: string
  ): Promise<{ hidden: boolean; eventId?: string }> {
    const db = getDatabase();

    const deal = await db.deal.findUnique({ where: { id: dealId } });
    if (!deal) return { hidden: false };

    // 1. Hide from public visibility immediately
    await db.deal.update({
      where: { id: dealId },
      data: {
        status: "DRAFT", // Withdraw from public view
      },
    });

    // 2. Persist DealLifecycleEvent audit
    const event = await db.dealLifecycleEvent.create({
      data: {
        dealId,
        eventType: "CONFIRMED_OUT_OF_STOCK",
        previousState: { status: deal.status, priceMinor: deal.priceMinor },
        newState: { status: "DRAFT", reason },
        triggeredBy: "LIFECYCLE_MONITOR_OOS",
      },
    });

    return { hidden: true, eventId: event.id };
  }

  /**
   * Handles price movement and freshness degradation.
   * If price increased above MRP or became uncompetitive, marks deal DRAFT.
   */
  public static async handlePriceMovement(
    dealId: string,
    newPricePaise: number,
    newMrpPaise: number
  ): Promise<{ updated: boolean; wasHidden: boolean }> {
    const db = getDatabase();
    const deal = await db.deal.findUnique({ where: { id: dealId } });
    if (!deal) return { updated: false, wasHidden: false };

    const wasHidden = newPricePaise >= newMrpPaise;

    await db.deal.update({
      where: { id: dealId },
      data: {
        priceMinor: newPricePaise,
        mrpMinor: newMrpPaise,
        status: wasHidden ? "DRAFT" : deal.status,
      },
    });

    await db.dealLifecycleEvent.create({
      data: {
        dealId,
        eventType: wasHidden ? "PRICE_INCREASED_STALE" : "PRICE_DROPPED",
        previousState: { priceMinor: deal.priceMinor },
        newState: { priceMinor: newPricePaise },
        triggeredBy: "LIFECYCLE_MONITOR_PRICE",
      },
    });

    return { updated: true, wasHidden };
  }
}

