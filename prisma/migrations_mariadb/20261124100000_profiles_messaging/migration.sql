-- Additive only: public profile fields, messaging state per participant, shares, send de-duplication, native app tokens.
ALTER TABLE `ForumProfile` ADD COLUMN `displayName` VARCHAR(60) NULL, ADD COLUMN `location` VARCHAR(80) NULL, ADD COLUMN `lastSeenAt` DATETIME(3) NULL;

ALTER TABLE `DmThread` ADD COLUMN `lowDeliveredAt` DATETIME(3) NULL, ADD COLUMN `highDeliveredAt` DATETIME(3) NULL, ADD COLUMN `lowMutedAt` DATETIME(3) NULL, ADD COLUMN `highMutedAt` DATETIME(3) NULL, ADD COLUMN `lowArchivedAt` DATETIME(3) NULL, ADD COLUMN `highArchivedAt` DATETIME(3) NULL, ADD COLUMN `lowClearedAt` DATETIME(3) NULL, ADD COLUMN `highClearedAt` DATETIME(3) NULL;

ALTER TABLE `DmMessage` ADD COLUMN `kind` VARCHAR(12) NOT NULL DEFAULT 'TEXT', ADD COLUMN `refId` VARCHAR(191) NULL, ADD COLUMN `clientId` VARCHAR(40) NULL;
CREATE UNIQUE INDEX `DmMessage_senderId_clientId_key` ON `DmMessage`(`senderId`, `clientId`);

CREATE TABLE `CustomerAppToken` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `device` VARCHAR(80) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `lastUsedAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `CustomerAppToken_tokenHash_key`(`tokenHash`),
    INDEX `CustomerAppToken_customerId_idx`(`customerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `CustomerAppToken` ADD CONSTRAINT `CustomerAppToken_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
