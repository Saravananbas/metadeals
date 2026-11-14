-- AlterTable (additive: counters default to 0, rich text is optional)
ALTER TABLE `ForumPost` ADD COLUMN `likeCount` INTEGER NOT NULL DEFAULT 0;
ALTER TABLE `ForumComment` ADD COLUMN `likeCount` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `bodyHtml` TEXT NULL;

-- CreateTable
CREATE TABLE `ForumPostLike` (
    `id` VARCHAR(191) NOT NULL,
    `postId` VARCHAR(191) NOT NULL,
    `profileId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ForumPostLike_postId_profileId_key`(`postId`, `profileId`),
    INDEX `ForumPostLike_profileId_idx`(`profileId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ForumCommentLike` (
    `id` VARCHAR(191) NOT NULL,
    `commentId` VARCHAR(191) NOT NULL,
    `profileId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ForumCommentLike_commentId_profileId_key`(`commentId`, `profileId`),
    INDEX `ForumCommentLike_profileId_idx`(`profileId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ForumPostLike` ADD CONSTRAINT `ForumPostLike_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `ForumPost`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ForumPostLike` ADD CONSTRAINT `ForumPostLike_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `ForumProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ForumCommentLike` ADD CONSTRAINT `ForumCommentLike_commentId_fkey` FOREIGN KEY (`commentId`) REFERENCES `ForumComment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ForumCommentLike` ADD CONSTRAINT `ForumCommentLike_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `ForumProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Sorting by likes
CREATE INDEX `ForumComment_postId_likeCount_idx` ON `ForumComment`(`postId`, `likeCount`);
