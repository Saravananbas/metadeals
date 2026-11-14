-- CreateTable (additive: a new table, nothing existing is changed)
CREATE TABLE `ForumNotification` (
    `id` VARCHAR(191) NOT NULL,
    `recipientId` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `type` VARCHAR(30) NOT NULL,
    `postId` VARCHAR(191) NOT NULL,
    `postSlug` VARCHAR(120) NOT NULL,
    `postTitle` VARCHAR(200) NOT NULL,
    `commentId` VARCHAR(191) NULL,
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ForumNotification_recipientId_readAt_createdAt_idx`(`recipientId`, `readAt`, `createdAt`),
    INDEX `ForumNotification_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ForumNotification` ADD CONSTRAINT `ForumNotification_recipientId_fkey` FOREIGN KEY (`recipientId`) REFERENCES `ForumProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ForumNotification` ADD CONSTRAINT `ForumNotification_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `ForumProfile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
