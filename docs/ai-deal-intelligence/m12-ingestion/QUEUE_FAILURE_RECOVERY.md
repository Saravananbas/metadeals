# Queue Failure Recovery & Resilience Architecture (M12)

**Infrastructure**: BullMQ 6.5.3 + Redis 6.0 (`src/server/queue/`)

---

## 1. Resilience Patterns

| Failure Scenario | Built-in Mechanism | Recovery Behavior |
| :--- | :--- | :--- |
| **Transient Network / HTTP 5xx** | BullMQ Exponential Backoff | Retries up to 3 times with exponential delay (2000ms base). |
| **Worker Process Restart** | BullMQ Lock Renewal & Atomic State | Active jobs re-claimed by available workers after lock timeout without job loss. |
| **Redis Outage** | Offline Queue / Error Event Trapping | Producers buffer briefly or throw contained errors; workers pause until connection restores. |
| **Database Outage** | Transaction Rollback & Job Re-attempt | Prisma transaction rolls back partially inserted records; job fails and retries via BullMQ. |
| **Exhausted Failures** | Structured Dead-Letter Audit | On final failure, worker triggers `writeAudit()` logging `QUEUE_JOB_FAILED_<WORKER>` with error details. |
| **Graceful Shutdown** | `BackgroundWorkerManager.gracefulShutdown()` | Permits active jobs up to 5000ms to complete before closing Redis sockets. |

