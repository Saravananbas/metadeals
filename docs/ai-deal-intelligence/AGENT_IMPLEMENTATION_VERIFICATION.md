# Agent Implementation & Architecture Verification — MetaDeals4U

**Audit Date**: November 8, 2026  
**Status**: Completed  
**Scope**: Verification of actual agent source files, execution pipelines, API/worker/scheduler bindings, and architectural location.

---

## 1. Actual Folder Structure & Source File Locations

The agent implementations are located in `src/server/scraper/` rather than a separate `src/server/agents/` folder:

| Module / Agent Name | Actual Source File Path |
| :--- | :--- |
| **Agent 1** (Retailer Deal Hunter & Approval) | `src/server/scraper/agent1-deal-hunter.ts` |
| **Agent 2** (Central Secure Publishing Engine) | `src/server/scraper/agent2-publishing-engine.ts` |
| **Agent 3** (Competitor Shadow Intelligence) | `src/server/scraper/agent3-shadow-intelligence.ts` |
| **Deal Quality Engine** | `src/server/scraper/deal-quality-engine.ts` |
| **Source Health & Circuit Breaker** | `src/server/scraper/source-health.ts` |
| **Deal Lifecycle Manager** | `src/server/scraper/deal-lifecycle-manager.ts` |

---

## 2. Detailed Verification of Each Agent

### 2.1 Agent 1 — Retailer Deal Hunter (`agent1-deal-hunter.ts`)
- **Exported Classes & Functions**:
  - `class Agent1DealHunter`
  - `static async processDiscoveredOffer(offer, historyPrices)`
  - `static async handleTelegramApproval(candidateId, action, assessment, allowedAdminIds)`
- **Dependencies**: `node:crypto`, `@/server/db/client`, `./deal-quality-engine`, `./source-health`.
- **Database Models Used**: `PublicationAuthorization` (`prisma.publicationAuthorization`), `SourceHealthRecord`.
- **AI / LLM Integration**: **None**. Uses 100% deterministic logic (rule-based thresholds on authenticity score > 75, stock availability checks, and mathematical price error detection).
- **Executable State**: Fully executable standalone TypeScript module with complete test coverage in `tests/m05-agent1-telegram-approval.test.ts`.
- **Current Integration Status**:
  - **Not called from any public API route**.
  - **Not called from background workers or schedulers**.
  - Telegram callbacks currently exist as a unit-tested function without a mounted webhook route (`/api/telegram/webhook`).

---

### 2.2 Agent 2 — Central Publishing Engine (`agent2-publishing-engine.ts`)
- **Exported Classes & Functions**:
  - `class Agent2PublishingEngine`
  - `static setKillSwitch(active: boolean): void`
  - `static isKillSwitchActive(): boolean`
  - `static async publishCandidate(request: PublishingPreflightRequest): Promise<PublishingResult>`
- **Dependencies**: `@/server/db/client`, `./publishing` (`publishVerifiedCandidate`), `@/server/affiliate/adapters/registry`.
- **Database Models Used**: `PublicationAuthorization`, `DealCandidate`, `Deal`.
- **AI / LLM Integration**: **None**. Pure deterministic state machine and cryptographic token validator.
- **Executable State**: Fully executable TypeScript module with complete test coverage in `tests/m06-agent2-secure-publisher.test.ts`.
- **Current Integration Status**:
  - **Invoked by API**: Imported in `src/app/api/v1/admin/intelligence-controls/route.ts` to read and toggle the global emergency publishing kill-switch (`setKillSwitch`, `isKillSwitchActive`).
  - **Deal Publishing Handoff**: `publishCandidate` is not yet connected to an automated background worker; it is designed to be triggered after Telegram authorization is confirmed.

---

### 2.3 Agent 3 — Competitor Shadow Intelligence (`agent3-shadow-intelligence.ts`)
- **Exported Classes & Functions**:
  - `class Agent3ShadowIntelligence`
  - `static async recordCompetitorCandidate(offer: NormalizedOfferContract)`
  - `static evaluateShadowOutcome(input: ShadowEvaluationInput)`
- **Dependencies**: `@/server/db/client`, `./deal-quality-engine`, `./source-health`.
- **Database Models Used**: `ShadowCandidate` (`prisma.shadowCandidate`).
- **AI / LLM Integration**: **None**. Deterministic pricing differential calculation.
- **Strict Isolation Verification**:
  - Verified: **Never writes to the `Deal` table**.
  - Verified: **Never generates a `PublicationAuthorization`**.
  - Verified: Explicit guard in Agent 2 (`if (request.callerAgent === "AGENT_3") return { published: false, error: "AGENT_3_SHADOW_RESTRICTION..." }`).
- **Current Integration Status**:
  - Accessible via Admin API telemetry (`src/app/api/v1/admin/intelligence-controls/route.ts` queries `db.shadowCandidate.count()`).
  - Lacks an automated recurring queue worker to run scheduled competitor crawls.

---

## 3. Execution Chain Tracing

### 3.1 Retailer Deal Discovery → Website Publication Flow
```
[ Retailer Feeds / DOM Scrapers ]
               │
               ▼
[ Source Health Check ] ── (source-health.ts: Circuit Breaker)
               │ (Allowed)
               ▼
[ Agent 1: Deal Hunter ] ── (agent1-deal-hunter.ts: processDiscoveredOffer)
               │
               ▼
[ Deal Quality Engine ] ── (deal-quality-engine.ts: Authenticity & MRP discount scoring)
               │
               ├─ If Price Error Suspected ──────────► [ Flagged: SUSPECTED_PRICE_ERROR ]
               ├─ If Score < 75 ─────────────────────► [ Held: REVIEW_REQUIRED ]
               └─ If Authenticity > 75 & In-Stock ───► [ Route: AWAITING_APPROVAL ]
                                                              │
                                                              ▼
                                                   [ Telegram Notification ]
                                                              │
                                                              ▼ (Admin Click / Callback)
                                                   [ Cryptographic Validation ]
                                                   - Validates Admin Allowlist
                                                   - Freshness check (< 15 mins)
                                                              │
                                                              ▼
                                                   [ PublicationAuthorization Created ]
                                                   (Persisted in DB with 2h expiration)
                                                              │
                                                              ▼
                                                   [ Agent 2: Publishing Gatekeeper ]
                                                   - Checks Emergency Kill-Switch
                                                   - Validates Token & Non-expired state
                                                   - Re-verifies inStock
                                                              │
                                                              ▼
                                                   [ Atomic Publication ]
                                                   - Inserts into `Deal` table
                                                   - Updates status to "PUBLISHED"
                                                              │
                                                              ▼
                                                   [ Public Website & UI ]
```

### 3.2 Competitor Shadow Flow (Agent 3 Isolation)
```
[ Competitor Source (e.g. Scraped Competitor Feed) ]
               │
               ▼
[ Source Verification: Must be COMPETITOR type ]
               │
               ▼
[ Agent 3: Shadow Intelligence ] ── (agent3-shadow-intelligence.ts)
               │
               ▼
[ Deal Quality Scoring ] ── (Evaluates discount against market)
               │
               ▼
[ Persist in ShadowCandidate Table ONLY ] ◄── STRICT FIREWALL
   (No Deal records, No public visibility, No affiliate conversion)
               │
               ▼
[ Admin Telemetry & Manual Calibration Dashboard ]
```

---

## 4. Gap Analysis: Missing Glue & Runtime Triggers

While the **core logic, algorithmic models, database schemas, and unit tests** are 100% complete, the **runtime orchestration glue** connecting them to live web requests and cron loops is incomplete:

1. **Missing Telegram Webhook Endpoint**:
   - `Agent1DealHunter.handleTelegramApproval` is fully implemented and tested, but there is no `src/app/api/telegram/webhook/route.ts` to receive inbound HTTP callbacks from Telegram servers.
2. **Missing Ingestion Worker / Scheduled Trigger**:
   - `src/server/queue/connection.ts` defines Redis connection settings for BullMQ, but no active queue workers or cron jobs exist to run `Agent1DealHunter.processDiscoveredOffer` automatically on a continuous schedule.
3. **Admin Telemetry Endpoint**:
   - `src/app/api/v1/admin/intelligence-controls/route.ts` is implemented and connects to `Agent2PublishingEngine.isKillSwitchActive()` and `db.shadowCandidate.count()`, but lacks dedicated endpoints to manually trigger an immediate agent scan or review individual shadow candidates.

---

## 5. Architecture Recommendation

### Recommendation: **Keep Current Locations or Use a Clean Facade**

1. **Why Retain Current Code in `src/server/scraper/`**:
   - The existing scraper pipeline (`ScraperService`, `publishing.ts`, `verification.ts`, `source-health.ts`) already resides in `src/server/scraper/`.
   - The agents directly orchestrate these scraper tools and share common types (`NormalizedOfferContract`, `QualityAssessment`).
   - Moving them right now without a functional reason creates import churn across tests and codebase files.
2. **If Moving to `src/server/agents/` in the Future**:
   - Do **NOT** move files abruptly.
   - The best pattern is to create `src/server/agents/index.ts` as an export facade re-exporting the classes from `@/server/scraper/` so that consumers can import from either path without breaking existing references.

