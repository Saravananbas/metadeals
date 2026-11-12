# Database Migration Report – PublicationAuthStatus

## Schema Modification
The PostgreSQL enum `PublicationAuthStatus` was extended:

```sql
ALTER TYPE "PublicationAuthStatus" ADD VALUE IF NOT EXISTS 'CLAIMED';
ALTER TYPE "PublicationAuthStatus" ADD VALUE IF NOT EXISTS 'PUBLISHING';
ALTER TYPE "PublicationAuthStatus" ADD VALUE IF NOT EXISTS 'RECOVERY_REQUIRED';
```

## Prisma Client Regeneration
Prisma client was regenerated at `src/generated/prisma`.

Supported Enum Values:
- `PENDING_APPROVAL`
- `APPROVED`
- `CLAIMED`
- `PUBLISHING`
- `PUBLISHED`
- `REJECTED`
- `EXPIRED`
- `RECOVERY_REQUIRED`

