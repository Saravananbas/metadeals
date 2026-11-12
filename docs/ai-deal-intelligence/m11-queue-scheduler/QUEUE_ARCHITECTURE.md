# Queue Architecture — MetaDeals4U (M11)

**Architecture Level**: Enterprise Background Queue Infrastructure  
**Underlying Engine**: BullMQ 6.5.3 + Redis 6.0 (ioredis)  
**Port Convention**: Redis running at `127.0.0.1:6380`

---

## 1. Queue Topology

```
+-------------------------------------------------------------------+
|                        MetaDeals4U App / API                      |
+---------------------------------+---------------------------------+
                                  |
               +------------------+------------------+
               |                  |                  |
               v                  v                  v
     +-------------------+ +---------------+ +------------------+
     |   Source Scrape   | | Deal Discovery| |  Deal Lifecycle  |
     |       Queue       | |     Queue     | |      Queue       |
     +---------+---------+ +-------+-------+ +--------+---------+
               |                   |                  |
               v                   v                  v
     +-------------------+ +---------------+ +------------------+
     |ScrapeWorker (c=2) | |DiscoveryWorker| | LifecycleWorker  |
     |Circuit Breaker    | |Agent 1 Scoring| | Stock & Price    |
     +-------------------+ +---------------+ +------------------+
                                  |
                                  v
                    +---------------------------+
                    |  Competitor Shadow Queue  |
                    | (100% Shadow Isolation)   |
                    +-------------+-------------+
                                  |
                                  v
                    +---------------------------+
                    | ShadowWorker (c=2)        |
                    | Never Publishes / Deal=0  |
                    +---------------------------+
```

---

## 2. Dedicated Queues & Responsibilities

| Queue Name | Payload Interface | Concurrency | Retry / Backoff | Deduplication Strategy |
| :--- | :--- | :--- | :--- | :--- |
| `source-scrape-queue` | `ScrapeJobPayload` | 2 | 3 attempts, exponential 2000ms | Custom JobId: `scrape_<sourceId>_<5m_window>` |
| `deal-discovery-queue` | `DiscoveryJobPayload` | 5 | 3 attempts, exponential 2000ms | Custom JobId: `discovery_<candidateId>` |
| `deal-lifecycle-queue` | `LifecycleJobPayload` | 2 | 3 attempts, exponential 2000ms | Custom JobId: `lifecycle_<dealId>_<action>` |
| `competitor-shadow-queue`| `ShadowJobPayload` | 2 | 3 attempts, exponential 2000ms | Custom JobId: `shadow_<source>_<encoded_url>` |

---

## 3. Reliability & Idempotency Features

1. **Deterministic Deduplication Job IDs**: BullMQ rejects inserting a second job with an identical custom `jobId` while the previous job is active or completed within its retention window.
2. **Exponential Backoff**: Jobs automatically retry up to 3 times with exponential backoff on transient Redis or network drops.
3. **Structured Audit on Failure**: Any exhausted job failure triggers `writeAudit()` logging `QUEUE_JOB_FAILED_<WORKER>`, saving error messages and job input parameters.
4. **Clean Job Retention**: Completed jobs are pruned to the last 1000 records; failed jobs are retained up to 5000 records for diagnostic analysis.

