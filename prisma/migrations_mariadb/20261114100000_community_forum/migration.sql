-- CreateTable
CREATE TABLE `ForumCommunity` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(40) NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `description` VARCHAR(300) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `requiresReview` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ForumCommunity_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ForumProfile` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `handle` VARCHAR(30) NOT NULL,
    `bio` VARCHAR(280) NULL,
    `status` ENUM('ACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
    `suspendedUntil` DATETIME(3) NULL,
    `suspensionReason` VARCHAR(300) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ForumProfile_customerId_key`(`customerId`),
    UNIQUE INDEX `ForumProfile_handle_key`(`handle`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ForumPost` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(120) NOT NULL,
    `communityId` VARCHAR(191) NOT NULL,
    `authorId` VARCHAR(191) NOT NULL,
    `type` ENUM('DEAL', 'DISCUSSION', 'QUESTION') NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `body` TEXT NOT NULL,
    `url` VARCHAR(2048) NULL,
    `urlHash` CHAR(64) NULL,
    `merchantName` VARCHAR(100) NULL,
    `priceMinor` INTEGER NULL,
    `mrpMinor` INTEGER NULL,
    `couponCode` VARCHAR(50) NULL,
    `contentHash` CHAR(64) NOT NULL,
    `status` ENUM('PENDING_REVIEW', 'PUBLISHED', 'REMOVED', 'DELETED') NOT NULL DEFAULT 'PUBLISHED',
    `locked` BOOLEAN NOT NULL DEFAULT false,
    `score` INTEGER NOT NULL DEFAULT 0,
    `commentCount` INTEGER NOT NULL DEFAULT 0,
    `removalReason` VARCHAR(300) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `publishedAt` DATETIME(3) NULL,
    `editedAt` DATETIME(3) NULL,

    UNIQUE INDEX `ForumPost_slug_key`(`slug`),
    INDEX `ForumPost_status_publishedAt_id_idx`(`status`, `publishedAt`, `id`),
    INDEX `ForumPost_communityId_status_publishedAt_idx`(`communityId`, `status`, `publishedAt`),
    INDEX `ForumPost_status_score_publishedAt_idx`(`status`, `score`, `publishedAt`),
    INDEX `ForumPost_authorId_createdAt_idx`(`authorId`, `createdAt`),
    INDEX `ForumPost_urlHash_idx`(`urlHash`),
    INDEX `ForumPost_authorId_contentHash_idx`(`authorId`, `contentHash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ForumComment` (
    `id` VARCHAR(191) NOT NULL,
    `postId` VARCHAR(191) NOT NULL,
    `authorId` VARCHAR(191) NOT NULL,
    `parentId` VARCHAR(191) NULL,
    `depth` INTEGER NOT NULL DEFAULT 0,
    `body` TEXT NOT NULL,
    `status` ENUM('PENDING_REVIEW', 'PUBLISHED', 'REMOVED', 'DELETED') NOT NULL DEFAULT 'PUBLISHED',
    `score` INTEGER NOT NULL DEFAULT 0,
    `removalReason` VARCHAR(300) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `editedAt` DATETIME(3) NULL,

    INDEX `ForumComment_postId_parentId_createdAt_idx`(`postId`, `parentId`, `createdAt`),
    INDEX `ForumComment_parentId_createdAt_idx`(`parentId`, `createdAt`),
    INDEX `ForumComment_authorId_createdAt_idx`(`authorId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ForumPostVote` (
    `id` VARCHAR(191) NOT NULL,
    `postId` VARCHAR(191) NOT NULL,
    `profileId` VARCHAR(191) NOT NULL,
    `value` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ForumPostVote_profileId_idx`(`profileId`),
    UNIQUE INDEX `ForumPostVote_postId_profileId_key`(`postId`, `profileId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ForumCommentVote` (
    `id` VARCHAR(191) NOT NULL,
    `commentId` VARCHAR(191) NOT NULL,
    `profileId` VARCHAR(191) NOT NULL,
    `value` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ForumCommentVote_profileId_idx`(`profileId`),
    UNIQUE INDEX `ForumCommentVote_commentId_profileId_key`(`commentId`, `profileId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ForumSave` (
    `id` VARCHAR(191) NOT NULL,
    `postId` VARCHAR(191) NOT NULL,
    `profileId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ForumSave_profileId_createdAt_idx`(`profileId`, `createdAt`),
    UNIQUE INDEX `ForumSave_postId_profileId_key`(`postId`, `profileId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ForumFollow` (
    `id` VARCHAR(191) NOT NULL,
    `communityId` VARCHAR(191) NOT NULL,
    `profileId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ForumFollow_profileId_idx`(`profileId`),
    UNIQUE INDEX `ForumFollow_communityId_profileId_key`(`communityId`, `profileId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ForumReport` (
    `id` VARCHAR(191) NOT NULL,
    `reporterId` VARCHAR(191) NOT NULL,
    `targetType` ENUM('POST', 'COMMENT', 'PROFILE') NOT NULL,
    `postId` VARCHAR(191) NULL,
    `commentId` VARCHAR(191) NULL,
    `targetProfileId` VARCHAR(191) NULL,
    `category` ENUM('SPAM', 'SCAM', 'HARASSMENT', 'HATE', 'ILLEGAL', 'PRIVACY', 'IMPERSONATION', 'OFF_TOPIC', 'OTHER') NOT NULL,
    `details` VARCHAR(500) NULL,
    `status` ENUM('OPEN', 'RESOLVED', 'DISMISSED', 'ESCALATED') NOT NULL DEFAULT 'OPEN',
    `version` INTEGER NOT NULL DEFAULT 1,
    `resolvedById` VARCHAR(191) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `resolution` VARCHAR(300) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ForumReport_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `ForumReport_postId_idx`(`postId`),
    INDEX `ForumReport_commentId_idx`(`commentId`),
    UNIQUE INDEX `ForumReport_reporterId_postId_key`(`reporterId`, `postId`),
    UNIQUE INDEX `ForumReport_reporterId_commentId_key`(`reporterId`, `commentId`),
    UNIQUE INDEX `ForumReport_reporterId_targetProfileId_key`(`reporterId`, `targetProfileId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ForumModerationAction` (
    `id` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(40) NOT NULL,
    `targetType` VARCHAR(12) NOT NULL,
    `postId` VARCHAR(191) NULL,
    `commentId` VARCHAR(191) NULL,
    `profileId` VARCHAR(191) NULL,
    `reason` VARCHAR(500) NOT NULL,
    `correlationId` VARCHAR(36) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ForumModerationAction_createdAt_idx`(`createdAt`),
    INDEX `ForumModerationAction_postId_idx`(`postId`),
    INDEX `ForumModerationAction_profileId_idx`(`profileId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ForumProfile` ADD CONSTRAINT `ForumProfile_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ForumPost` ADD CONSTRAINT `ForumPost_communityId_fkey` FOREIGN KEY (`communityId`) REFERENCES `ForumCommunity`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ForumPost` ADD CONSTRAINT `ForumPost_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `ForumProfile`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ForumComment` ADD CONSTRAINT `ForumComment_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `ForumPost`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ForumComment` ADD CONSTRAINT `ForumComment_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `ForumProfile`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ForumComment` ADD CONSTRAINT `ForumComment_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `ForumComment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ForumPostVote` ADD CONSTRAINT `ForumPostVote_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `ForumPost`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ForumPostVote` ADD CONSTRAINT `ForumPostVote_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `ForumProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ForumCommentVote` ADD CONSTRAINT `ForumCommentVote_commentId_fkey` FOREIGN KEY (`commentId`) REFERENCES `ForumComment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ForumCommentVote` ADD CONSTRAINT `ForumCommentVote_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `ForumProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ForumSave` ADD CONSTRAINT `ForumSave_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `ForumPost`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ForumSave` ADD CONSTRAINT `ForumSave_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `ForumProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ForumFollow` ADD CONSTRAINT `ForumFollow_communityId_fkey` FOREIGN KEY (`communityId`) REFERENCES `ForumCommunity`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ForumFollow` ADD CONSTRAINT `ForumFollow_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `ForumProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ForumReport` ADD CONSTRAINT `ForumReport_reporterId_fkey` FOREIGN KEY (`reporterId`) REFERENCES `ForumProfile`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ForumReport` ADD CONSTRAINT `ForumReport_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `ForumPost`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ForumReport` ADD CONSTRAINT `ForumReport_commentId_fkey` FOREIGN KEY (`commentId`) REFERENCES `ForumComment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ForumReport` ADD CONSTRAINT `ForumReport_targetProfileId_fkey` FOREIGN KEY (`targetProfileId`) REFERENCES `ForumProfile`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ForumReport` ADD CONSTRAINT `ForumReport_resolvedById_fkey` FOREIGN KEY (`resolvedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ForumModerationAction` ADD CONSTRAINT `ForumModerationAction_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
