# Telegram Webhook Security Specification

## Security Measures
1. **Header Secret Verification:** `x-telegram-bot-api-secret-token` validated using `crypto.timingSafeEqual` in constant time.
2. **Fail-Closed Configuration:** If `process.env.TELEGRAM_WEBHOOK_SECRET` is unset, all incoming webhook calls return HTTP 401.
3. **Admin Identity Validation:** `from.id` from `callback_query` updates is checked against the configured Telegram admin allowlist.
4. **Callback Freshness:** Rejects callback queries older than 15 minutes (900 seconds) to prevent delayed playback attacks.
5. **Audit Logging:** Every rejection and approval triggers a durable record in `AuditEvent`.

