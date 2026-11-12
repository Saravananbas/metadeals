# M09 – MetaDeals4U Intelligence Admin Dashboard and Operational Controls

Integrate into the existing admin application, design system, authentication and navigation. Preserve existing DealManager and DealCard. Do not build a second deal management system.

## Pages/capabilities
- Intelligence overview.
- Retailer sources.
- Competitor sources.
- Agent configuration and health.
- Product identity and variants.
- Historical price analytics.
- Approval queue.
- Review Required.
- Suspected price errors.
- Published deal lifecycle.
- Agent 3 shadow analytics.
- Source health.
- Affiliate performance.
- AI/model cost analytics.
- Execution and audit logs.
- Emergency controls.

## Operational controls
- Enable/disable/pause/resume agents.
- Run source scan now.
- Configure source schedules and categories.
- Configure model provider/model safely.
- Global publishing kill switch.
- Per-agent and per-source pause.
- Bulk hide/deactivate.
- Reverify and reactivate.
- Agent 3 shadow-only status visible and enforced.

## Security
Only authorized admins can change sources, policies, approvals and publishing settings. Secrets must never be sent to browser responses. Backend must enforce permissions and effective operating mode; frontend controls are not security boundaries.

## UX
Responsive desktop/tablet/mobile. Show last successful scan, extraction quality, failed jobs, stale deals, pending approvals, suspected price errors, shadow results and publication status. Clearly distinguish real data from estimates.

## Tests
Role-based access, API authorization, kill switch, shadow mode, responsive layouts, existing admin regression and build/type/lint checks.

## Acceptance
Administrators can operate and monitor the platform in the existing dashboard without duplicate management functionality. Agent 3 remains shadow-only.
