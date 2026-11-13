# Database backup and restore: procedure and test evidence

**Result of the test on 13 Nov 2026: a real backup of a MariaDB database was restored into a separate empty database and verified. The data in that test is the local development database (synthetic and test data, 3 test customers), on the owner's PC.** It is not a test of Hostinger's own daily backups, which this integration cannot list or restore (see "Not verified").

## What was found first
- The only backup files already on this PC (`.local/backups/*.dump`, 2 and 3 Nov 2026) are **PostgreSQL** dumps from before the move to MariaDB. They cannot be restored into MariaDB, so they were not used.
- The Hostinger integration has no operation to list, create or restore backups. The staging and production databases were **not** touched.

## Test setup (isolated)
| Item | Value |
|---|---|
| Source | local MariaDB 11.8, database `metadeals` (59 tables, 2,686 rows, 6 MB), development data only |
| Target | a new empty database `metadeals_restore_check` on the same local server (never the source, never Hostinger) |
| Tool | `mariadb-dump` and `mariadb` from MariaDB 11.8 |
| Where the backup file lives | `.local/restore-test/` (ignored by Git, on the owner's PC; delete it when no longer needed) |

## Procedure (repeatable)
1. **Back up** (consistent snapshot, no locks, includes routines, triggers and events):
   `mariadb-dump -h HOST -P PORT -u USER --single-transaction --routines --triggers --events --hex-blob --default-character-set=utf8mb4 DATABASE > backup.sql`
   Do **not** use `--databases`: it writes `CREATE DATABASE`/`USE`, which would restore over the original by name.
2. **Record integrity:** `sha256sum backup.sql > backup.sql.sha256`, and check the last line of the file reads `-- Dump completed on ...`.
3. **Create an empty target:** `CREATE DATABASE metadeals_restore_check CHARACTER SET utf8mb4;`
4. **Restore into the target named on the command line:** `mariadb -u USER --default-character-set=utf8mb4 metadeals_restore_check < backup.sql`
5. **Verify** (below), then **drop the target** when finished: `DROP DATABASE metadeals_restore_check;` (only that exact name).

## Evidence
| Check | Result |
|---|---|
| Backup duration and size | 0.93 s, 1,238,082 bytes |
| File integrity | SHA-256 recorded and re-verified `OK`; ends with `-- Dump completed on 2026-11-13 18:07:00`; 59 `CREATE TABLE` statements; no `CREATE DATABASE` or `USE` line |
| Restore duration | **2.2 s** |
| Tables restored | 59 of 59, same names |
| Row counts | 59 of 59 tables equal (2,686 rows in total) |
| Table checksums (`CHECKSUM TABLE`) | 59 of 59 equal (the first script run reported 58 because of a parsing quirk on the empty `account` table; a manual check showed checksum `0` on both sides) |
| Columns | 623 column definitions identical (type, nullability, default, position) |
| Indexes | 315 index columns identical |
| Foreign keys | 59 constraints identical (names, tables, update and delete rules) |
| Relationship consistency | all 59 foreign-key columns checked in the restored copy: **0 orphan rows** |
| Application connectivity | the app's own Prisma client and its homepage listing code ran against the restored copy as a **read-only** database user: 186 deals, 30 merchants, 85 categories, 3 customers (all equal to the source), 15 deals returned for the homepage, 444 ms |
| Source untouched | the source database was only read; the restore never named it |

## Recovery procedure for the real site (to be followed, not yet exercised on Hostinger)
1. Do not restore over the live database. In hPanel, Databases, create a **new** database and user for the restore, or use phpMyAdmin Import into a new database.
2. Restore the chosen backup there (hPanel, Backups, or an `.sql` from `mariadb-dump`).
3. Run the verification checks above against it (row counts and the application read check).
4. Point `DATABASE_URL` at the restored database only after step 3 passes, redeploy (the variable is baked at build), and verify the homepage, sign-in and admin sign-in.
5. Keep the old database untouched until the owner confirms; then remove it.
6. Re-apply customer deletion requests received since the backup date (see `DATA_RETENTION_AND_DELETION_PROPOSAL.md`).
7. **Customer data:** a backup of the real database holds customer information. Keep dumps on an encrypted disk, never in Git, never in a shared folder, and delete test restores when finished.

## Not verified
- **Hostinger's automatic daily backups**: availability, retention period, encryption and the restore button were not tested (no integration access). *Owner step:* in hPanel open Backups, restore the latest daily backup of the **staging** database into a new scratch database, and run the checks above. Record the date here.
- **Restore of a production-size database** (this test was 6 MB; Hostinger allows up to 3 GB).
- **Off-site copies:** no automatic copy of backups outside Hostinger exists; decide whether to run a weekly `mariadb-dump` from your PC.

Status: **procedure verified on a local MariaDB; Hostinger backups NOT verified.**
