# MetaDeals4U Community Forum Handoff

This folder contains the product plan, technical architecture, and implementation prompt for a Reddit-inspired community forum inside the existing MetaDeals4U application.

## Documents

1. [Product plan](PRODUCT_PLAN.md) — user journeys, scope, policies, and release phases.
2. [Technical architecture](TECHNICAL_ARCHITECTURE.md) — proposed data model, API, security, moderation, scalability, and architecture diagram.
3. [Claude implementation prompt](CLAUDE_IMPLEMENTATION_PROMPT.md) — ready to paste into Claude Code after opening the existing `D:\Metadeals` repository.

## Repository context to verify first

At handoff time, the working tree already contains uncommitted work related to customer profiles and customer-submitted deals, including `CommunityDealSubmission`, customer profile/submission APIs, and an admin submission review area. Treat those files as existing user work: inspect `git status`, diffs, and the current database state before editing. Do not overwrite or assume that uncommitted code is deployed, complete, or verified.

The customer-submitted-deal approval queue and a Reddit-like discussion forum are separate product workflows. Keep them separate in the UI, API, authorization, and data model unless repository evidence supports a safe shared primitive. Existing admin-reviewed submissions are not the same as community posts that publish immediately.

## Reference

The public [DesiDime posts page](https://www.desidime.com/posts) presents multiple post types (deals, coupons, discussions, feedback), topic groups, store areas, community voting, comments, and trending discussions. This is used only as a feature-pattern reference. MetaDeals should use its own branding, taxonomy, moderation rules, and implementation; do not copy site text, artwork, or proprietary design.

The fetched reference page is a snapshot and may not represent the site’s current behavior. Verify any time-sensitive design details directly before making product decisions.
