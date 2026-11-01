# MetaDeals4U — Project Rules and Guardrails

## Product vision

Build a new, premium Indian deals discovery and affiliate platform. The old website is not a source-code dependency and must not be copied or reintroduced. The current new Next.js application in this repository is the source of truth.

## Existing project context

The project is located at `D:\Metadeals`. M0 foundation and M1/M2 homepage/responsive implementation were previously reported complete. The homepage currently contains clearly labelled illustrative/demo offers. Verify the actual repository before relying on this status.

## Current brand direction

- Brand: MetaDeals4U
- Typography: Manrope, weights 400, 500, 600, 700, 800
- Visual direction: premium, minimal glassmorphism with soft pink/purple/blue ambient gradients; white or lightly tinted frosted surfaces; restrained blur and shadows
- Brand accents: deep/royal purple and orange
- Maintain clear contrast and readable product prices.
- Use the latest user-approved pink/purple/blue glassmorphism homepage reference as the visual source of truth for M1.5. Do not reinterpret the layout without need.
- Keep product cards sufficiently opaque for readability.
- Responsive website is required at desktop, tablet and mobile widths.

## Platform strategy

1. Responsive Next.js website.
2. Future Android and iOS apps using React Native + Expo.
3. Shared backend services and database.
4. Do not build the mobile apps in this workstream. Make sensible API and business-logic choices so mobile clients can be added later.

## Engineering guardrails

- Inspect the existing repository, package manager, scripts, database schema and architecture before changes.
- Preserve working code and existing functionality.
- Do not replace the project, scaffold a second app, or migrate to a monorepo unless a written assessment proves it is necessary and the user approves.
- Use existing versions and patterns where possible; do not perform broad dependency upgrades.
- Do not introduce a second ORM, database, auth framework, queue, styling system or component library if one already exists.
- Use TypeScript and existing lint/test conventions.
- Keep business logic out of UI components.
- Validate and authorize all server-side mutations.
- Use database migrations for schema changes; never drop or reset existing data.
- Add indexes and constraints where appropriate.
- Use accessible semantic HTML and keyboard support.
- Use server-side secrets only.
- Never commit `.env`, credentials, access tokens, private keys or customer data.
- Keep `.env.example` with placeholders.
- Do not fabricate provider capabilities, commission rates, product details or transaction data.
- Clearly label demo content and mock integration responses.
- Do not claim a test passed unless it ran and passed.
- Record skipped checks and reasons.
- Avoid unrelated refactors.

## External integrations and production safety

- Do not send real Telegram or WhatsApp messages during development.
- Do not publish real deals or contact subscribers.
- Do not make purchases, incur charges or deploy to production.
- Use mocks/test adapters until the user supplies credentials and explicitly approves live testing.
- WhatsApp group/community posting must not rely on unofficial automation. Provide user-initiated share links for existing groups/communities; use official WhatsApp Business Platform only for supported opted-in messaging.
- Affiliate program eligibility, APIs, terms, attribution and reporting vary by provider. Implement provider-specific adapters and do not assume uniform capabilities.
- Affiliate clicks are not purchases; estimated commission is not confirmed commission.

## Git safety

- Inspect `git status` before starting.
- Do not discard, reset, overwrite or clean uncommitted user work.
- Do not force-push.
- Do not rewrite shared history.
- Work on the current task branch if one exists; otherwise create a clearly named task branch from the agreed development branch only if safe.
- Commit coherent module changes only if Git identity and repository state permit. If not, leave changes staged/unstaged as appropriate and report.
