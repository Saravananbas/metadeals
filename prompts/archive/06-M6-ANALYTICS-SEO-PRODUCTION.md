# M6 — Analytics, SEO, Security and Production Readiness

## Objective

Prepare the platform for a controlled launch. This module must not deploy or publish anything to production.

## Analytics

Implement truthful reporting for:
- Deal views where measurable
- Outbound affiliate clicks
- Clicks by deal, merchant and source/channel
- Provider-reported orders
- Provider-reported commission statuses
- Publishing success/failure by channel

Clearly distinguish:
- Views vs clicks
- Clicks vs purchases
- Estimated vs reported/approved commission

Use privacy-conscious analytics and avoid collecting unnecessary personal data.

## SEO

- Unique page titles and meta descriptions.
- Canonical URLs.
- Open Graph and social metadata.
- Sitemap and robots configuration.
- Keep staging/development `noindex`.
- Enable indexing only through an explicit production configuration.
- Structured data only when accurate and compliant with search engine requirements.
- Product/deal schema must reflect actual visible content and current availability.
- Avoid fabricated ratings, prices, review counts or availability.

## Performance and accessibility

- Review image optimization and dimensions.
- Use responsive images and lazy loading where appropriate.
- Avoid layout shift.
- Review bundle size and unnecessary client components.
- Keyboard navigation and focus states.
- Semantic landmarks and accessible labels.
- Contrast checks, especially for glass surfaces.
- Mobile performance review.

## Security

- Review authentication/authorization.
- Validate all server inputs.
- Review rate limits and abuse controls.
- Review URL/redirect validation.
- Review upload validation.
- Review secrets and environment handling.
- Review dependency vulnerabilities using existing tooling.
- Ensure logs do not expose credentials or personal data.

## Production readiness report

Provide a checklist of required environment variables, database migrations, storage setup, domain/HTTPS, backup/restore, monitoring, scheduled jobs, provider approvals and legal/affiliate disclosures.

## Restrictions

- Do not deploy.
- Do not enable indexing for staging.
- Do not send real messages.
- Do not use live affiliate credentials.
- Do not mark launch-ready if required checks are missing.
