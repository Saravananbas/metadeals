import test from "node:test";
import assert from "node:assert/strict";
import { QueueProducers } from "../src/server/queue/producers";
import { BackgroundWorkerManager } from "../src/server/queue/workers";
import { TaskScheduler } from "../src/server/queue/scheduler";

test("Queue Producers: Successfully enqueues source scrape job with deduplication ID", async () => {
  const timestamp = Date.now();
  const job = await QueueProducers.enqueueScrapeJob({
    sourceId: "amazon-crawler",
    sourceType: "RETAILER",
    triggeredBy: "UNIT_TEST",
    timestamp,
  });

  assert.ok(job.id, "Enqueued job must have an ID");
  assert.match(job.id, /^scrape_amazon-crawler_/);
  assert.equal(job.data.sourceId, "amazon-crawler");
});

test("Queue Producers: Prevents duplicate job enqueuing within deduplication window", async () => {
  const fixedTimestamp = 1700000000000;
  const job1 = await QueueProducers.enqueueScrapeJob({
    sourceId: "flipkart-crawler",
    sourceType: "RETAILER",
    triggeredBy: "UNIT_TEST_DUP_1",
    timestamp: fixedTimestamp,
  });

  const job2 = await QueueProducers.enqueueScrapeJob({
    sourceId: "flipkart-crawler",
    sourceType: "RETAILER",
    triggeredBy: "UNIT_TEST_DUP_2",
    timestamp: fixedTimestamp,
  });

  assert.equal(job1.id, job2.id, "Duplicate enqueue within window must resolve to exact same job ID");
});

test("Queue Producers: Enqueues deal discovery and lifecycle jobs", async () => {
  const discoveryJob = await QueueProducers.enqueueDiscoveryJob({
    candidateId: "cand-test-123",
    offerData: {
      sourceId: "amazon",
      productName: "Test Phone",
      brand: "Brand",
      productUrl: "https://amazon.in/dp/test",
      mrpPaise: 100000,
      sellingPricePaise: 80000,
      isAvailable: true,
    },
    observedAt: Date.now(),
  });
  assert.equal(discoveryJob.id, "discovery_cand-test-123");

  const lifecycleJob = await QueueProducers.enqueueLifecycleJob({
    dealId: "deal-test-456",
    action: "CHECK_STOCK",
    scheduledAt: Date.now(),
  });
  assert.equal(lifecycleJob.id, "lifecycle_deal-test-456_CHECK_STOCK");
});

test("Queue Producers: Competitor shadow job enqueued strictly in shadow channel", async () => {
  const shadowJob = await QueueProducers.enqueueShadowJob({
    competitorSource: "competitor-telegram",
    productUrl: "https://t.me/deals/1",
    pricePaise: 50000,
    mrpPaise: 100000,
    observedAt: Date.now(),
  });

  assert.match(shadowJob.id || "", /^shadow_competitor-telegram_/);
  assert.equal(shadowJob.data.competitorSource, "competitor-telegram");
});

test("Background Worker Manager: Initializes workers and reports running health status", () => {
  BackgroundWorkerManager.startWorkers();
  const health = BackgroundWorkerManager.getHealth();

  assert.ok(health.length >= 4, "Must start 4 background workers (scrape, discovery, lifecycle, shadow)");
  for (const worker of health) {
    assert.equal(worker.isRunning, true, `Worker ${worker.name} should report isRunning`);
  }
});

test("Task Scheduler: Registers recurring cron definitions and supports manual execution", async () => {
  TaskScheduler.initializeSchedules();
  const tasks = TaskScheduler.getTasks();

  assert.ok(tasks.length >= 3, "Must have at least 3 scheduled recurring tasks");
  assert.ok(tasks.some((t) => t.id === "schedule-source-scrape-hourly"));
  assert.ok(tasks.some((t) => t.id === "schedule-deal-lifecycle-30m"));
  assert.ok(tasks.some((t) => t.id === "schedule-competitor-shadow-4h"));

  // Test manual trigger
  const triggerSuccess = await TaskScheduler.triggerManually("schedule-source-scrape-hourly");
  assert.equal(triggerSuccess, true);

  const invalidTrigger = await TaskScheduler.triggerManually("non-existent-task");
  assert.equal(invalidTrigger, false);
});

test("Graceful Shutdown: Workers and Schedulers shut down cleanly without unhandled rejections", async () => {
  await BackgroundWorkerManager.gracefulShutdown(2000);
  TaskScheduler.shutdown();
  await QueueProducers.closeAll();

  const health = BackgroundWorkerManager.getHealth();
  assert.equal(health.length, 0, "All workers should be deregistered after shutdown");
});
