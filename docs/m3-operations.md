# M3 operating guide

Admin: `/admin/deals`, using existing M2.5 MFA sessions. Editors create/edit/publish;
Admins and Super Admins also manage catalogs, affiliate links, archive and delete
never-published drafts. Account administration retains its separate permission gate.

Create categories (optional parent), merchants, upload a product image, then save a
draft. Prices are integer paise. Ratings are optional and require a source label.
Preview the saved version before publishing. Preview authorization expires after ten
minutes and is bound to the actor, deal and version. Editing withdraws a published
deal to draft/review. Concurrent edits return 409. Previously published deals cannot
be deleted; archive them. Catalog deletion is not exposed, preserving references.

Publication/start timestamps schedule visibility without a background process.
Every public query checks status, publication/start and expiry. Expiry hides the deal
even if its stored status still says PUBLISHED. Public lists are bounded to 48 records
and provide nextCursor; homepage search/filtering uses the server and loads more via
IntersectionObserver with a manual load-more/retry control. No demo offer fallback
or seeding occurs. Existing promotional mockups remain explicitly labelled samples.

## Images

`MEDIA_STORAGE=local` is the default only outside production. Generated UUID WebP
files live in ignored `.local/media`, served by ID after visibility/auth checks.
Production uses the existing private S3 client/configuration; local storage is
rejected in production. Configure S3 before uploading production assets. Development
media must be migrated to S3 before release; copying the database alone is insufficient.
Uploads accept decoded JPEG/PNG/WebP, max 5 MB, 6000×6000/25 MP; animated images and
SVG are rejected. Sharp strips metadata and resizes/re-encodes to max 1600×1600.
Do not delete local orphan files without reviewing references; they are retained for
recovery. No live S3 upload was tested because provider credentials are unavailable.

## Imports

Admin supports CSV and values-only XLSX (first sheet), max 1 MB/100 rows. Validate and
preview before confirming. The import is a single transaction of new drafts, never
an overwrite. Unique slugs reject duplicates. Upload media first and reference IDs.
Required columns: slug,title,description,categoryId,merchantId,mediaId,mrpMinor,
priceMinor,productUrl. Optional: brand,affiliateUrl,rating,reviewCount,ratingSource,
publishedAt,startsAt,expiresAt,featured,trending. Dates: ISO timestamps with timezone.
Formula/macro/external-link workbooks and oversized expanded archives are rejected.
Purchase options are added in the editor after import. XLSX reader documentation:
https://github.com/catamphetamine/read-excel-file

## API boundaries

- GET `/api/v1/deals`: q/category/store/view/limit/cursor; public fields only.
- GET `/api/v1/deals/{slug}`; GET `/api/v1/catalog`; GET `/api/v1/media/{id}`.
- `/api/v1/admin/deals`: GET/POST; `/{id}` GET/PUT/DELETE;
  `/{id}/preview`, `/{id}/publish`, `/{id}/archive`: POST.
- `/api/v1/admin/categories` and `/merchants`: GET/POST; `/{id}` PUT.
- POST `/api/v1/admin/media?alt=...`: raw image bytes.
- POST `/api/v1/admin/imports?format=csv|xlsx&confirm=true|false`: raw file bytes.

Mutations require an existing admin cookie and matching Origin. Authorization is
checked on the server. Errors use `{error:{code,message,fields?}}`; no raw DB errors.
Mobile bearer authentication, general public rate limits and wishlist sync belong
to M7; affiliate redirect safety/tracking belong to M4.

## Validation evidence

28 unit tests; lint/types; production build/smoke; Prisma validate/status passed.
`node --conditions=react-server --import tsx scripts/deals-integration-test.ts`
uses a rollback-only local transaction and covers permissions, CRUD, preview binding,
concurrency, DTO fields, cursor pagination, scheduling, expiry, deletion, audit,
image validation and positive/negative CSV/XLSX imports.
`node --conditions=react-server --import tsx scripts/m3-http-test.ts` uses temporary
records and real MFA recovery login against port 4123, then cleans only its fixtures.
It verifies admin rendering, taxonomy/upload, CSRF, publish, public detail/media and archive.
Browser: empty homepage, search, mobile menu/Escape, no console errors; no horizontal
overflow at 1536/768/390/320. Screenshots in docs/screenshots/m3. Full authenticated
admin UI click-through and live S3 remain unverified; HTTP workflows were exercised.
