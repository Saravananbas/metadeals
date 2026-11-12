# Database security (MariaDB on Hostinger, Prisma 7)

## Facts
- Staging and the intended production database are MariaDB 11.x through the Prisma MariaDB adapter. A Postgres schema also exists but is not deployed.
- **MariaDB has no row-level security.** Isolation between users is enforced only by the application: every customer-owned query includes the owner in its `where` clause (`{id, customerId}` for submissions; `authorId` for forum edits; thread participants for direct messages). This was reviewed by reading code and is **not** backed by database policies.
- All raw SQL (`src/server/analytics/queries.ts`, `rollup.ts`) uses tagged, parameterised templates; identifiers are hard-coded literals. No `$queryRawUnsafe` or string-built SQL was found in application code.
- Sensitive fields: staff `passwordHash`, `totpSecretEncrypted` (AES-256-GCM), recovery-code hashes, session token hashes, setup/reset token hashes; customer `passwordHash`, email, name, date of birth, sex, location; direct-message bodies; moderation reports. No public serializer selects password or secret fields (reviewed).
- Foreign keys on customer data use `Restrict`, so a customer row cannot be hard-deleted while records reference it. There is no deletion route yet (held).

## Not verified (not visible from source)
- Which database user the app connects as and its privileges. Because migrations run with the same URL today, it probably has DDL rights.
- Whether Remote MySQL rules are still open; who can reach port 3306.
- Backup encryption, retention and a tested restore. Hostinger takes daily backups; **a restore has not been tested.**

## Recommended (held; see `HOLD_FOR_OWNER_APPROVAL.md`)
1. Create two users in hPanel: a runtime user with SELECT, INSERT, UPDATE, DELETE on the app database only, and a migration user used only when deploying. Put the runtime user in `DATABASE_URL`.
2. Remove Remote MySQL rules when not migrating.
3. Test a restore of the daily backup into a scratch database and record the date.
4. Keep `ADMIN` actions that read personal data audited (the audit log is append-only through the API).

## Migrations
The five migrations added in this project (analytics, submissions, forum, profile avatar, direct messages) only add tables and columns. They were applied to staging on 13 Nov 2026 after approval. This security work adds **no** schema change.
