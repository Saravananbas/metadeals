# M03 – Source Monitoring, Adapters and Health Management

Use the existing scraper architecture and job/scheduler system. Do not introduce a duplicate scheduler or queue.

## Source types
- RETAILER: Agent 1 sources.
- COMPETITOR: Agent 3 sources.
Only explicitly registered, enabled sources may be monitored.

## Extraction priority
1. Official APIs.
2. Permitted feeds/RSS.
3. Structured product metadata.
4. HTML extraction.
5. Playwright for dynamic pages.
6. LLM-assisted extraction only when needed.

## Normalized offer contract
Return source ID/type, product name, brand, model/variant identifiers, product URL, image reference, seller, MRP, selling price, currency, coupon, bank offer, delivery charge if known, availability, category, extraction timestamp, method and evidence reference.

## Source controls
- Register/update/disable/test source.
- Configure category and scan interval.
- Per-source rate limits and concurrency.
- Job locking and idempotency.
- Retry with exponential backoff.
- Circuit breaker after repeated failures.
- Track last success, HTTP status, products extracted, price extraction success, extraction failure rate, duration, consecutive failures and structure-change warnings.

## Safety
- Respect website terms and access restrictions.
- Do not bypass CAPTCHA, authentication or anti-bot controls.
- Protect against SSRF, malicious redirects, DNS rebinding and internal-network access.
- Restrict outbound fetches to approved public domains and validate redirect destinations.
- Treat website content as untrusted input.
- A scraper failure is UNKNOWN, not product UNAVAILABLE.

## Tests
Adapter contracts, mocked extraction, malformed pages, rate limiting, retry, circuit breaker, redirects, source allowlist and failure recovery.

## Acceptance
At least three authorized/test sources can be monitored using the common contract; source health correctly distinguishes successful extraction, extraction failure and unavailable product. No publishing is implemented.
