# Worker Configuration & Lifecycle Management — MetaDeals4U (M11)

**Source File**: `src/server/queue/workers/index.ts`  
**Worker Engine**: BullMQ Workers on Node.js

---

## 1. Registered Workers

```ts
BackgroundWorkerManager.startWorkers();
```

| Worker Class | Queue | Concurrency | Handler Description |
| :--- | :--- | :--- | :--- |
| `SourceScrapeWorker` | `source-scrape-queue` | 2 | Executes connector crawl within circuit breaker limits. |
| `DiscoveryWorker` | `deal-discovery-queue` | 5 | Runs Agent 1 deal quality assessment and routes to approval. |
| `LifecycleWorker` | `deal-lifecycle-queue` | 2 | Runs price reverification and stock availability audits. |
| `ShadowWorker` | `competitor-shadow-queue` | 2 | Runs Agent 3 competitor analysis in **100% Shadow Isolation**. |

---

## 2. Worker Lifecycle & Graceful Shutdown

To prevent dropped jobs during server reloads, deployments, or test teardowns, `BackgroundWorkerManager` provides a timed graceful shutdown hook:

```ts
await BackgroundWorkerManager.gracefulShutdown(5000); // 5000ms max timeout
```

- **Graceful Draining**: Actively running jobs are permitted up to 5 seconds to finish their current execution.
- **Connection Teardown**: Closes ioredis worker connections cleanly, eliminating orphan Redis listeners.
- **Health Telemetry**: `BackgroundWorkerManager.getHealth()` returns live execution status and active job counts for health check endpoints.

