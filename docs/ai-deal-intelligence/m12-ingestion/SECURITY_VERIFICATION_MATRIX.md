# Security Verification Matrix: Ingestion & Publishing Isolation (M12)

**Audit Date**: November 8, 2026  
**Auditor**: Principal Software Architect & Application Security Engineer

---

## 1. Security Control Verification Matrix

| Security Boundary | Control Description | Enforcement Mechanism | Status |
| :--- | :--- | :--- | :--- |
| **Ingestion Publishing Firewall** | Ingestion pipeline must never call Agent 2 or publish deals directly. | IngestionService code paths strictly terminate at `deal-discovery-queue` enqueue; zero calls to `publishVerifiedCandidate`. | **VERIFIED & ACTIVE** |
| **Agent 3 Isolation** | Competitor crawler cannot publish deals or modify public deal records. | Hardcoded rejection in `agent2-publishing-engine.ts` (`if (callerIdentity.role === 'AGENT_3') return error`). | **VERIFIED & ACTIVE** |
| **Product Variant Firewall** | Distinct variants must never be merged. | Primary lookup strictly uses `(sourcePlatform, externalId)` unique constraint; fallback uses exact URL. | **VERIFIED & ACTIVE** |
| **Price Error Firewall** | Severe price anomalies (>75% drop) must never auto-publish. | Flagged as `SUSPECTED_PRICE_ERROR` by DealQualityEngine; rejected by Telegram automated approval. | **VERIFIED & ACTIVE** |
| **Out-of-Stock Fallacy Guard** | Scraper errors must never be classified as out of stock. | Exceptions increment connector failure counts in `SourceHealthRecord` with status `UNKNOWN`; `inStock` is untouched. | **VERIFIED & ACTIVE** |
| **Cuelinks V3 Preservation** | Ingestion must not mutate outbound affiliate routes. | Ingestion populates raw deal candidates; Cuelinks link conversion (`/go/[dealId]`) remains completely independent. | **VERIFIED & ACTIVE** |

