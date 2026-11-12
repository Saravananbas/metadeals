import { Queue, type JobsOptions } from "bullmq";
import {
  getQueueConnection,
  QUEUE_NAMES,
  type ScrapeJobPayload,
  type DiscoveryJobPayload,
  type LifecycleJobPayload,
  type ShadowJobPayload,
} from "../connection";

const queueInstances = new Map<string, Queue>();

function getOrCreateQueue<T>(name: string): Queue<T> {
  let queue = queueInstances.get(name) as Queue<T> | undefined;
  if (!queue) {
    queue = new Queue<T>(name, {
      connection: getQueueConnection("producer"),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    });
    queueInstances.set(name, queue as unknown as Queue);
  }
  return queue;
}

export class QueueProducers {
  /**
   * Enqueues a retailer or competitor scrape task with deduplication.
   */
  public static async enqueueScrapeJob(
    payload: ScrapeJobPayload,
    options?: JobsOptions
  ) {
    const queue = getOrCreateQueue<ScrapeJobPayload>(QUEUE_NAMES.SOURCE_SCRAPE);
    const jobId = `scrape_${payload.sourceId}_${Math.floor(payload.timestamp / (5 * 60 * 1000))}`.replace(/[:\/]/g, "_");
    return queue.add("source-scrape", payload, {
      jobId,
      ...options,
    });
  }

  /**
   * Enqueues deal candidate discovery processing.
   */
  public static async enqueueDiscoveryJob(
    payload: DiscoveryJobPayload,
    options?: JobsOptions
  ) {
    const queue = getOrCreateQueue<DiscoveryJobPayload>(QUEUE_NAMES.DEAL_DISCOVERY);
    const jobId = `discovery_${payload.candidateId}`.replace(/[:\/]/g, "_");
    return queue.add("deal-discovery", payload, {
      jobId,
      ...options,
    });
  }

  /**
   * Enqueues recurring deal lifecycle verification.
   */
  public static async enqueueLifecycleJob(
    payload: LifecycleJobPayload,
    options?: JobsOptions
  ) {
    const queue = getOrCreateQueue<LifecycleJobPayload>(QUEUE_NAMES.DEAL_LIFECYCLE);
    const jobId = `lifecycle_${payload.dealId}_${payload.action}`.replace(/[:\/]/g, "_");
    return queue.add("deal-lifecycle", payload, {
      jobId,
      ...options,
    });
  }

  /**
   * Enqueues competitor shadow analysis (STRICTLY SHADOW ONLY).
   */
  public static async enqueueShadowJob(
    payload: ShadowJobPayload,
    options?: JobsOptions
  ) {
    const queue = getOrCreateQueue<ShadowJobPayload>(QUEUE_NAMES.COMPETITOR_SHADOW);
    const safeUrl = encodeURIComponent(payload.productUrl).replace(/[:%]/g, "_");
    const jobId = `shadow_${payload.competitorSource}_${safeUrl}`.replace(/[:\/]/g, "_");
    return queue.add("competitor-shadow", payload, {
      jobId,
      ...options,
    });
  }

  /**
   * Closes all active producer queues cleanly.
   */
  public static async closeAll(): Promise<void> {
    for (const queue of queueInstances.values()) {
      await queue.close();
    }
    queueInstances.clear();
  }
}
