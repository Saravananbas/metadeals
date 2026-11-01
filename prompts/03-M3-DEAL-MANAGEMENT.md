# M3 — Database-Backed Deal Management

## Objective

Replace illustrative homepage deal data with a real database-backed deal management capability and build admin CRUD workflows.

## Discovery and data safety

- Inspect the current Prisma schema and database state.
- Reuse existing models where possible.
- Produce a schema/migration plan before applying changes.
- Never reset, drop or overwrite the database.
- Preserve any existing data.

## Core data model

Design or extend models for:
- Deal
- Category
- Store/Merchant
- Product image/media
- Deal status and publication timestamps
- Deal expiry
- Featured/trending flags
- Original product URL
- Optional manually supplied affiliate URL (future integration)
- Created/updated by user
- Audit history where appropriate

Deal fields should support:
- Stable ID/slug
- Product title
- Short description
- Product image
- Category
- Merchant/store
- MRP
- Deal price
- Currency (INR initially)
- Computed discount percentage (calculate consistently; avoid trusting client input)
- Savings amount
- Rating/review count only when sourced/entered and labelled accurately
- Start/end or expiry date
- Status: DRAFT, PENDING_REVIEW, PUBLISHED, EXPIRED, ARCHIVED
- Featured flag
- Source/product URL
- Affiliate URL optional
- Created/updated timestamps

Add appropriate indexes, unique constraints and relations.

## Admin workflows

- Create, view, edit, archive and delete only where safe.
- Prefer archive/soft-delete for published deals.
- Preview before publishing.
- Validate price values (non-negative; deal price should be valid relative to MRP).
- Validate URLs and image inputs.
- Select category and merchant.
- Upload/store images using existing storage approach; if no storage exists, create a documented provider abstraction and safe local development fallback.
- Support expiry and scheduled publication fields if straightforward.
- Enforce role permissions from M2.5.

## Public website

- Read published, non-expired deals from the database.
- Replace demo data only when live data path is complete.
- Provide graceful empty states.
- Keep demo offers clearly marked if demo fallback remains.
- Add pagination or bounded listing to avoid loading unlimited deals.
- Search/filter should use server-side data where practical.

## Tests

CRUD, validation, permissions, publication visibility, expiry behavior, image validation and database queries.

## Out of scope

Do not implement affiliate network API calls, Telegram publishing, WhatsApp sending or production deployment in this module.
