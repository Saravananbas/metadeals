-- CreateTable
CREATE TABLE `CommunityDealSubmissionImage` (
    `id` VARCHAR(191) NOT NULL,
    `submissionId` VARCHAR(191) NOT NULL,
    `position` INTEGER NOT NULL,
    `imageKey` VARCHAR(160) NOT NULL,
    `imageProvider` VARCHAR(10) NOT NULL,
    `imageMime` VARCHAR(40) NOT NULL,
    `imageBytes` INTEGER NOT NULL,
    `imageWidth` INTEGER NOT NULL,
    `imageHeight` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `CommunityDealSubmissionImage_submissionId_position_key`(`submissionId`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Brand` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `slug` VARCHAR(120) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Brand_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CommunityDealSubmissionImage` ADD CONSTRAINT `CommunityDealSubmissionImage_submissionId_fkey` FOREIGN KEY (`submissionId`) REFERENCES `CommunityDealSubmission`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
