-- AlterTable
ALTER TABLE `Customer` ADD COLUMN `dateOfBirth` DATE NULL,
    ADD COLUMN `location` VARCHAR(100) NULL,
    ADD COLUMN `sex` VARCHAR(20) NULL;

-- CreateTable
CREATE TABLE `CommunityDealSubmission` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING_REVIEW', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING_REVIEW',
    `title` VARCHAR(200) NOT NULL,
    `brand` VARCHAR(100) NULL,
    `description` VARCHAR(2000) NOT NULL,
    `productUrl` VARCHAR(2048) NOT NULL,
    `urlHash` CHAR(64) NOT NULL,
    `merchantName` VARCHAR(100) NULL,
    `categoryHint` VARCHAR(100) NULL,
    `priceMinor` INTEGER NOT NULL,
    `mrpMinor` INTEGER NULL,
    `couponCode` VARCHAR(50) NULL,
    `imageKey` VARCHAR(160) NOT NULL,
    `imageProvider` VARCHAR(10) NOT NULL,
    `imageMime` VARCHAR(40) NOT NULL,
    `imageBytes` INTEGER NOT NULL,
    `imageWidth` INTEGER NOT NULL,
    `imageHeight` INTEGER NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `resubmissions` INTEGER NOT NULL DEFAULT 0,
    `submittedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `reviewedById` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `rejectionReason` VARCHAR(500) NULL,
    `dealId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CommunityDealSubmission_dealId_key`(`dealId`),
    INDEX `CommunityDealSubmission_status_submittedAt_idx`(`status`, `submittedAt`),
    INDEX `CommunityDealSubmission_customerId_status_idx`(`customerId`, `status`),
    UNIQUE INDEX `CommunityDealSubmission_customerId_urlHash_key`(`customerId`, `urlHash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CommunityDealSubmission` ADD CONSTRAINT `CommunityDealSubmission_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CommunityDealSubmission` ADD CONSTRAINT `CommunityDealSubmission_reviewedById_fkey` FOREIGN KEY (`reviewedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CommunityDealSubmission` ADD CONSTRAINT `CommunityDealSubmission_dealId_fkey` FOREIGN KEY (`dealId`) REFERENCES `Deal`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
