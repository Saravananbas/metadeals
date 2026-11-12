# M07 – Deal Lifecycle, Freshness and Affiliate Performance

Implement continuous lifecycle management for published deals using existing services and schemas.

## Monitor
- Current selling price.
- Availability.
- Seller changes.
- Product variant.
- Coupon and bank offer validity.
- Expiry.
- Last verification timestamp.
- Source health.

## Freshness
Use configurable verification intervals, stale-after limits and urgency-aware checks. Reverify immediately before publication.

## Unavailable handling
When unavailability is confirmed:
1. Immediately hide the existing deal from public visibility.
2. Remove from active listings/feeds where supported.
3. Invalidate relevant caches.
4. Record lifecycle event and evidence.
5. Notify admin via Telegram.
6. Recheck periodically.
7. Require fresh validation before reactivation.

A scrape failure, timeout, CAPTCHA or source outage is UNKNOWN, not confirmed unavailability. Use a second verification attempt where feasible, but once unavailability is confirmed, hide immediately.

## Price changes
- Recalculate deal attractiveness.
- Update price only after verification.
- Remove expired coupon claims.
- Flag material price increases.
- Hide or mark stale according to configured safety policy.
- Never allow stale price claims to remain indefinitely.

## Affiliate performance
Integrate existing click attribution and Cuelinks reporting capabilities. Track impressions/views if available, outbound clicks, referred orders, order value, order status, returned/cancelled items and commission status where reporting supports it. Distinguish estimated, pending and approved/earned commission. Do not invent unavailable affiliate reporting data.

## Controls
Global publishing kill switch, per-agent pause, per-source pause, bulk hide/deactivate, reverify and safe reactivation. Audit every action.

## Tests
Confirmed unavailable, transient scrape failure, price change, expired coupon, stale deal, cache invalidation, Telegram notification, reactivation and affiliate attribution regression.

## Acceptance
Confirmed unavailable deals are hidden and admins notified; temporary extraction failures do not falsely mark products unavailable.
