-- Staff account states: additive only. Two new status values (Disabled, Deleted) and three nullable suspension columns on User. No data is changed or removed; deleted accounts stay in the table and are only hidden from the admin list.

ALTER TABLE `User`
    MODIFY `status` ENUM('PENDING_SETUP', 'ACTIVE', 'SUSPENDED', 'DISABLED', 'DELETED') NOT NULL DEFAULT 'PENDING_SETUP',
    ADD COLUMN `suspendedFrom` DATETIME(3) NULL,
    ADD COLUMN `suspendedUntil` DATETIME(3) NULL,
    ADD COLUMN `suspensionReason` VARCHAR(300) NULL;
