-- AlterTable
ALTER TABLE `Deal` ADD COLUMN `editorNotes` VARCHAR(2800) NULL, ADD COLUMN `editorNotesBy` VARCHAR(80) NULL;

-- CreateTable
CREATE TABLE `DealVote` (
    `id` VARCHAR(191) NOT NULL,
    `dealId` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `value` INTEGER NOT NULL,
    `reason` VARCHAR(30) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `DealVote_dealId_value_idx`(`dealId`, `value`),
    UNIQUE INDEX `DealVote_customerId_dealId_key`(`customerId`, `dealId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DealNote` (
    `id` VARCHAR(191) NOT NULL,
    `dealId` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `content` VARCHAR(500) NOT NULL,
    `removedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DealNote_dealId_createdAt_idx`(`dealId`, `createdAt`),
    INDEX `DealNote_customerId_idx`(`customerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `DealVote` ADD CONSTRAINT `DealVote_dealId_fkey` FOREIGN KEY (`dealId`) REFERENCES `Deal`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `DealVote` ADD CONSTRAINT `DealVote_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `DealNote` ADD CONSTRAINT `DealNote_dealId_fkey` FOREIGN KEY (`dealId`) REFERENCES `Deal`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `DealNote` ADD CONSTRAINT `DealNote_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE `MemberStar` (
    `id` VARCHAR(191) NOT NULL,
    `giverId` VARCHAR(191) NOT NULL,
    `receiverId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MemberStar_receiverId_idx`(`receiverId`),
    UNIQUE INDEX `MemberStar_giverId_receiverId_key`(`giverId`, `receiverId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MemberStar` ADD CONSTRAINT `MemberStar_giverId_fkey` FOREIGN KEY (`giverId`) REFERENCES `ForumProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `MemberStar` ADD CONSTRAINT `MemberStar_receiverId_fkey` FOREIGN KEY (`receiverId`) REFERENCES `ForumProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE `DealComment` ADD COLUMN `customerId` VARCHAR(191) NULL;
CREATE INDEX `DealComment_customerId_idx` ON `DealComment`(`customerId`);
ALTER TABLE `DealComment` ADD CONSTRAINT `DealComment_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE `DealCommentLike` (
    `id` VARCHAR(191) NOT NULL,
    `commentId` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DealCommentLike_customerId_idx`(`customerId`),
    UNIQUE INDEX `DealCommentLike_commentId_customerId_key`(`commentId`, `customerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `DealCommentLike` ADD CONSTRAINT `DealCommentLike_commentId_fkey` FOREIGN KEY (`commentId`) REFERENCES `DealComment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `DealCommentLike` ADD CONSTRAINT `DealCommentLike_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `DealComment` ADD COLUMN `imageKey` VARCHAR(160) NULL, ADD COLUMN `imageProvider` VARCHAR(10) NULL;

ALTER TABLE `DealComment` ADD COLUMN `parentId` VARCHAR(191) NULL;
CREATE INDEX `DealComment_parentId_idx` ON `DealComment`(`parentId`);
ALTER TABLE `DealComment` ADD CONSTRAINT `DealComment_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `DealComment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
