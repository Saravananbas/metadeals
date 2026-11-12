# OpenRouter Integration Assessment — MetaDeals4U Platform

**Assessment Date**: November 8, 2026  
**Status**: Proposal Ready for Implementation Review  
**Gateway Target**: [OpenRouter API](https://openrouter.ai/) (`https://openrouter.ai/api/v1/chat/completions`)

---

## 1. Feasibility & Architecture Fit

### 1.1 Can OpenRouter be used as the Centralized LLM Gateway?
**Yes, seamlessly.**
- **Standard Protocol**: OpenRouter adheres strictly to the OpenAI-compatible REST API (`/v1/chat/completions`), returning standard JSON responses with token usage metadata.
- **Node.js Compatibility**: Can be implemented using native `fetch` (standard in Node.js 18+ and Next.js 16/App Router) without introducing bulky third-party SDK dependencies.
- **Unified Billing & Keys**: A single `OPENROUTER_API_KEY` grants access to models across Anthropic, Meta Llama, Mistral, Google Gemini, and DeepSeek, eliminating multiple vendor accounts.

---

## 2. Proposed Minimal Safe Implementation Plan

The architecture adheres strictly to the non-negotiable rule: **LLMs provide advice, extraction, and confidence scores; LLMs NEVER directly authorize or publish deals.**

```
+-------------------------------------------------------------+
|                     MetaDeals4U Engine                      |
|                                                             |
|   Agent 1 Scraper             Agent 2 Publisher             |
|   (Unstructured HTML)        (Product Matcher)              |
+--------------+-----------------------+----------------------+
               |                       |
               v                       v
      +-----------------------------------------+
      |       src/server/ai/openrouter.ts       |
      |   - Retry logic (Exponential backoff)   |
      |   - Timeout guards (max 8000ms)         |
      |   - Cost & token usage telemetry        |
      |   - Fallback to deterministic parser    |
      +--------------------+--------------------+
                           |
                           v  HTTPS POST
           https://openrouter.ai/api/v1/chat/completions
                           |
            +--------------+--------------+
            |                             |
     Fast Extraction              Precise Matcher
  (meta-llama/llama-3.1-8b)    (deepseek/deepseek-chat)
```

### 2.1 Proposed Model Assignments (Low-Cost / High-Speed)

| Task | Proposed Model | Reason | Approx Cost per 1M Tokens | Fallback Mechanism |
| :--- | :--- | :--- | :--- | :--- |
| **Unstructured Deal Extraction**<br>(Product Title, Price, Discount, Specs) | `meta-llama/llama-3.1-8b-instruct` or `google/gemini-flash-1.5` | Fast JSON extraction, high context window, negligible cost | ~$0.05 - $0.15 | Fall back to Cheerio / JSON-LD deterministic parser |
| **Category & Tag Classification** | `meta-llama/llama-3.1-8b-instruct` | Highly structured taxonomy matching | ~$0.05 | Fall back to rule-based keyword matcher |
| **Cross-Retailer Product Matching**<br>(Determining if Amazon & Flipkart items are identical) | `deepseek/deepseek-chat` or `openai/gpt-4o-mini` | Strong semantic reasoning on specs and model numbers | ~$0.14 - $0.15 | Fall back to Levenshtein / Token similarity score |

---

## 3. Reliability, Safety & Cost Control Guardrails

### 3.1 Strict Security & Safety Boundary
1. **No Autonomous Publishing by LLM**: Agent 2's validation pipeline retains deterministic validation of price sanity (current price must be strictly < historical average) and affirmative discount checks. An LLM cannot bypass `DealQualityEngine.evaluate()`.
2. **Deterministic Output Parsing**: Prompts will strictly enforce JSON schema output with Zod validation. If an LLM returns malformed JSON or hallucinates impossible discounts, the candidate deal is rejected or marked for manual review.

### 3.2 Resilience & Cost Tracking
1. **Timeouts**: Every call wrapped in `AbortSignal.timeout(8000)` (8s hard timeout).
2. **Retries**: Up to 2 retries with exponential backoff on HTTP 429/5xx only.
3. **Usage Logging**: Record `prompt_tokens`, `completion_tokens`, model identifier, and computed USD cost into the database table `ai_usage_logs`.
4. **Kill-Switch**: Controlled by environment variable `OPENROUTER_ENABLED=true/false`. If false, all agents operate 100% deterministically without error.

---

## 4. Proposed File Additions (Pending Approval)

- `src/server/ai/types.ts`: Structured schemas for extraction, classification, and matching requests/responses.
- `src/server/ai/openrouter-client.ts`: Resilient client with token accounting, latency metrics, and error handling.
- `src/server/ai/cost-tracker.ts`: Aggregation of daily and per-task AI spend.

