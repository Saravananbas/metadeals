import { QueueProducers } from "../producers";
import { logger } from "@/server/logging/logger";

export interface ScheduledTaskDefinition {
  id: string;
  name: string;
  cronExpression: string;
  type: "SCRAPE" | "LIFECYCLE" | "SHADOW";
  handler: () => Promise<void>;
}

export class TaskScheduler {
  private static registeredTasks: ScheduledTaskDefinition[] = [];
  private static activeTimers: NodeJS.Timeout[] = [];

  /**
   * Initializes recurring system jobs.
   */
  public static initializeSchedules(): void {
    if (this.registeredTasks.length > 0) return;

    // 1. Hourly Source Ingestion Check (Safe Discovery)
    this.registerTask({
      id: "schedule-source-scrape-hourly",
      name: "Hourly Source Health & Feeds Check",
      cronExpression: "0 * * * *",
      type: "SCRAPE",
      handler: async () => {
        logger.info("Executing scheduled hourly source check");
        await QueueProducers.enqueueScrapeJob({
          sourceId: "amazon-crawler",
          sourceType: "RETAILER",
          triggeredBy: "SCHEDULER_HOURLY",
          timestamp: Date.now(),
        });
      },
    });

    // 2. Deal Lifecycle Stock & Price Movement (Every 30 Minutes)
    this.registerTask({
      id: "schedule-deal-lifecycle-30m",
      name: "30-Minute Deal Lifecycle Reverification",
      cronExpression: "*/30 * * * *",
      type: "LIFECYCLE",
      handler: async () => {
        logger.info("Executing scheduled deal lifecycle reverification");
        await QueueProducers.enqueueLifecycleJob({
          dealId: "periodic-verification-sweep",
          action: "CHECK_STOCK",
          scheduledAt: Date.now(),
        });
      },
    });

    // 3. Competitor Shadow Analysis (Every 4 Hours)
    this.registerTask({
      id: "schedule-competitor-shadow-4h",
      name: "4-Hour Competitor Shadow Observation",
      cronExpression: "0 */4 * * *",
      type: "SHADOW",
      handler: async () => {
        logger.info("Executing scheduled competitor shadow observation");
        await QueueProducers.enqueueShadowJob({
          competitorSource: "telegram-competitor-channel",
          productUrl: "https://competitor.com/feed",
          pricePaise: 0,
          mrpPaise: 0,
          observedAt: Date.now(),
        });
      },
    });
  }

  public static registerTask(task: ScheduledTaskDefinition): void {
    this.registeredTasks.push(task);
  }

  public static getTasks(): ScheduledTaskDefinition[] {
    return [...this.registeredTasks];
  }

  /**
   * Triggers an immediate execution of a scheduled task by ID.
   */
  public static async triggerManually(taskId: string): Promise<boolean> {
    const task = this.registeredTasks.find((t) => t.id === taskId);
    if (!task) return false;
    await task.handler();
    return true;
  }

  /**
   * Stops all active scheduler timers cleanly.
   */
  public static shutdown(): void {
    for (const timer of this.activeTimers) {
      clearInterval(timer);
    }
    this.activeTimers = [];
    this.registeredTasks = [];
    logger.info("Task scheduler shut down cleanly.");
  }
}

