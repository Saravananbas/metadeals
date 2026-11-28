-- SEO deal addresses. Additive only: two nullable columns on Deal (filled by the backfill script) and one new table. No data is changed or removed.
-- AlterTable
ALTER TABLE `Deal` ADD COLUMN `publicId` VARCHAR(12) NULL,
    ADD COLUMN `canonicalPath` VARCHAR(300) NULL;

-- CreateTable
CREATE TABLE `DealUrlHistory` (
    `id` VARCHAR(191) NOT NULL,
    `dealId` VARCHAR(191) NOT NULL,
    `path` VARCHAR(300) NOT NULL,
    `reason` VARCHAR(20) NOT NULL,
    `redirectStatus` INTEGER NOT NULL DEFAULT 301,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `DealUrlHistory_path_key`(`path`),
    INDEX `DealUrlHistory_dealId_idx`(`dealId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `Deal_publicId_key` ON `Deal`(`publicId`);

-- CreateIndex
CREATE UNIQUE INDEX `Deal_canonicalPath_key` ON `Deal`(`canonicalPath`);
