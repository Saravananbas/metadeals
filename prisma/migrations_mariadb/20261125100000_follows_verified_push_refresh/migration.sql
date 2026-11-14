-- Additive only: member follows, staff-granted verified flag, push device tokens, app refresh tokens.
ALTER TABLE `ForumProfile` ADD COLUMN `verifiedAt` DATETIME(3) NULL, ADD COLUMN `verifiedById` VARCHAR(191) NULL;

ALTER TABLE `CustomerAppToken` ADD COLUMN `refreshHash` CHAR(64) NULL, ADD COLUMN `prevRefreshHash` CHAR(64) NULL, ADD COLUMN `refreshExpiresAt` DATETIME(3) NULL;
CREATE UNIQUE INDEX `CustomerAppToken_refreshHash_key` ON `CustomerAppToken`(`refreshHash`);

CREATE TABLE `ForumMemberFollow` (
    `id` VARCHAR(191) NOT NULL,
    `followerId` VARCHAR(191) NOT NULL,
    `followedId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ForumMemberFollow_followerId_followedId_key`(`followerId`, `followedId`),
    INDEX `ForumMemberFollow_followedId_idx`(`followedId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `DevicePushToken` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `platform` VARCHAR(10) NOT NULL,
    `token` VARCHAR(255) NOT NULL,
    `device` VARCHAR(80) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `DevicePushToken_token_key`(`token`),
    INDEX `DevicePushToken_customerId_idx`(`customerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ForumMemberFollow` ADD CONSTRAINT `ForumMemberFollow_followerId_fkey` FOREIGN KEY (`followerId`) REFERENCES `ForumProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ForumMemberFollow` ADD CONSTRAINT `ForumMemberFollow_followedId_fkey` FOREIGN KEY (`followedId`) REFERENCES `ForumProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `DevicePushToken` ADD CONSTRAINT `DevicePushToken_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
