# M5 — Telegram and WhatsApp Deal Distribution

## Objective

Create a controlled distribution workflow so an approved deal can be published to configured Telegram channels and prepared/shared through supported WhatsApp methods.

## Central publishing workflow

A deal should be:
1. Approved by an authorized user.
2. Checked for published status, expiry and required content.
3. Rendered into channel-specific message content.
4. Queued for selected destinations.
5. Sent only in test/mock mode until credentials and live approval exist.
6. Logged with destination, status, timestamps and provider message IDs where available.

Prevent duplicate posts using idempotency keys and per-destination publication records.

## Telegram

Use the official Telegram Bot API.

Requirements:
- Support multiple configured channels.
- Secure bot token storage.
- Document required bot admin permissions.
- Support text and product image/caption where API permits.
- Include deal title, price, discount, merchant and affiliate URL when available.
- Store message ID and delivery result.
- Support retry for transient failures.
- Add queue/status/history UI.
- Provide mock mode by default.
- Do not send real messages during unattended development.

## WhatsApp

Use only supported official methods.

A. Existing user groups and Communities:
- Generate a prefilled message and deal URL.
- Provide a user-initiated Share to WhatsApp action.
- Do not claim the Cloud API can post to arbitrary existing groups/Communities.
- Do not use unofficial WhatsApp Web automation, scraping or session hijacking.

B. Individual subscribers:
- Design an opt-in/consent model.
- Use official WhatsApp Business Platform capabilities only.
- Respect approved templates, policy windows, opt-out and applicable rules.
- Do not send messages without consent and explicit live approval.

## Admin UI

- Destination/channel management
- Per-deal channel selection
- Publishing queue
- Publishing history
- Retry failed job
- Preview generated message
- Test/mock mode indicator

## Reliability

- Queue jobs outside long-running request handlers.
- Use existing Redis/BullMQ configuration if present; otherwise assess before adding dependencies.
- Idempotency, bounded retries, dead-letter/error visibility.
- Check deal expiry before dispatch.
- Redact secrets from logs.

## Tests

Message rendering, Telegram mocked send, retry, duplicate prevention, expired deal, WhatsApp share URL generation, consent/opt-out enforcement and no-send behavior in mock mode.
