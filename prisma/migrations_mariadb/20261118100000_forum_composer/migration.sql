-- AlterTable (additive: optional sanitized rich text and a reply-notification preference; existing posts keep NULL / false)
ALTER TABLE `ForumPost` ADD COLUMN `bodyHtml` TEXT NULL,
    ADD COLUMN `notifyReplies` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `ForumPostImage` (
    `id` VARCHAR(191) NOT NULL,
    `postId` VARCHAR(191) NULL,
    `profileId` VARCHAR(191) NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `storageKey` VARCHAR(160) NOT NULL,
    `provider` VARCHAR(10) NOT NULL,
    `width` INTEGER NOT NULL,
    `height` INTEGER NOT NULL,
    `bytes` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ForumPostImage_postId_position_idx`(`postId`, `position`),
    INDEX `ForumPostImage_profileId_postId_createdAt_idx`(`profileId`, `postId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ForumPostDraft` (
    `id` VARCHAR(191) NOT NULL,
    `profileId` VARCHAR(191) NOT NULL,
    `payload` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ForumPostDraft_profileId_key`(`profileId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ForumPostImage` ADD CONSTRAINT `ForumPostImage_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `ForumPost`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ForumPostImage` ADD CONSTRAINT `ForumPostImage_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `ForumProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ForumPostDraft` ADD CONSTRAINT `ForumPostDraft_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `ForumProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
