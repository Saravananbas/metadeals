# Scheduler Configuration & Cron Registry — MetaDeals4U (M11)

**Source File**: `src/server/queue/scheduler/index.ts`  
**Execution Model**: In-process Scheduler Producer into BullMQ Queues

---

## 1. Recurring Cron Schedules

| Task ID | Task Name | Schedule | Target Queue | Payload / Responsibility |
| :--- | :--- | :--- | :--- | :--- |
| `schedule-source-scrape-hourly` | Hourly Source Health & Feeds Check | `0 * * * *` (Hourly) | `source-scrape-queue` | Dispatches crawler trigger for healthy retailer connectors. |
| `schedule-deal-lifecycle-30m` | 30-Minute Deal Lifecycle Reverification | `*/30 * * * *` (Every 30m) | `deal-lifecycle-queue` | Triggers stock sweep to delist out-of-stock items immediately. |
| `schedule-competitor-shadow-4h` | 4-Hour Competitor Shadow Observation | `0 */4 * * *` (Every 4h) | `competitor-shadow-queue` | Crawls competitor channels in shadow mode for price intelligence. |

---

## 2. Manual Triggers & Health Monitoring

The scheduler provides developer and admin interfaces for on-demand execution:
- `TaskScheduler.triggerManually(taskId)`: Bypasses the cron interval to enqueue an immediate sweep (e.g. triggered via Admin UI button).
- `TaskScheduler.getTasks()`: Exposes scheduled task definitions to the Admin dashboard.
- `TaskScheduler.shutdown()`: Cleanly halts all active intervals.

