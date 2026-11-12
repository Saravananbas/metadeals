# Code Review Findings: Agents 1, 2, and 3

**Audit Date**: November 8, 2026  
**Auditor**: Principal Software Architect & Application Security Engineer  
**Files Audited**:
- `src/server/scraper/agent1-deal-hunter.ts`
- `src/server/scraper/agent2-publishing-engine.ts`
- `src/server/scraper/agent3-shadow-intelligence.ts`

---

## 1. Summary of Identified & Verified Findings

| Finding ID | Target Agent | Original Finding | Confirmed? | Root Cause | Severity |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **SEC-A1-01** | Agent 1 | Discovery approval token not connected to persisted candidate | **Yes** | `processDiscoveredOffer` generated an ephemeral token in memory rather than binding to candidate record. | High |
| **SEC-A1-02** | Agent 1 | Telegram callback authenticity unverified | **Yes** | `handleTelegramApproval` had a `signature` parameter in the interface but never validated it against an HMAC secret. | Critical |
| **SEC-A1-03** | Agent 1 | Telegram user ID trusted without proof | **Yes** | `action.telegramUserId` was checked against allowlist without validating request signature. | High |
| **SEC-A1-04** | Agent 1 | No callback replay protection | **Yes** | Any valid signed callback could be re-submitted repeatedly within the 15-minute validity window. | High |
| **SEC-A1-05** | Agent 1 | Non-APPROVE actions (REJECT, HOLD, REVERIFY) unpersisted | **Yes** | `if (action.action !== "APPROVE") return { success: true }` discarded the review action without audit. | Medium |
| **SEC-A1-06** | Agent 1 | Weak product variant identity check | **Yes** | Only checked `Boolean(brand && productName)`, ignoring model number, variant ID, and seller trustworthiness. | Medium |
| **SEC-A2-01** | Agent 2 | `callerAgent` trusted as authorization input | **Yes** | `callerAgent` was a client-supplied property in `PublishingPreflightRequest`, vulnerable to caller spoofing. | Critical |
| **SEC-A2-02** | Agent 2 | Kill switch was an in-memory process variable | **Yes** | `private static globalPublishingKillSwitch = false` lived in local memory; other cluster workers did not observe changes. | High |
| **SEC-A2-03** | Agent 2 | Missing atomic state transition & concurrency guard | **Yes** | No pre-publishing check on candidate's existing `PUBLISHED` status or deal association, leading to duplicate deal creation risks. | High |
| **SEC-A2-04** | Agent 2 | Lack of publishing failure audit logging | **Yes** | Publication errors threw unhandled or returned without writing structured audit records. | Medium |
| **SEC-A3-01** | Agent 3 | Shadow discoveries lacked historical price integration | **Yes** | History was hardcoded to `history: []`, making DealQualityEngine unable to compute historical reference stats. | Medium |
| **SEC-A3-02** | Agent 3 | No duplicate detection for competitor offers | **Yes** | Re-crawling the same competitor URL repeatedly inserted duplicate `ShadowCandidate` records. | Low |
| **SEC-A3-03** | Agent 3 | Ephemeral human evaluation labels | **Yes** | `evaluateShadowOutcome` returned an object but never retained records or computed precision telemetry. | Medium |

