-- Migration for MariaDB (Staging/Production baseline sync)
-- Table: MerchantWebsiteDirectory

CREATE TABLE IF NOT EXISTS `MerchantWebsiteDirectory` (
    `id` VARCHAR(191) NOT NULL,
    `merchantCode` VARCHAR(50) NULL,
    `name` VARCHAR(150) NOT NULL,
    `websiteUrl` VARCHAR(2048) NOT NULL,
    `domain` VARCHAR(150) NOT NULL,
    `category` VARCHAR(100) NOT NULL DEFAULT 'UNCLASSIFIED',
    `categories` JSON NULL,
    `productFocus` VARCHAR(255) NULL,
    `businessModel` VARCHAR(100) NULL,
    `description` VARCHAR(2000) NULL,
    `country` VARCHAR(50) NOT NULL DEFAULT 'India',
    `status` ENUM('ACTIVE', 'INACTIVE', 'UNDER_REVIEW') NOT NULL DEFAULT 'ACTIVE',
    `verificationStatus` ENUM('VERIFIED', 'UNVERIFIED', 'NEEDS_REVIEW') NOT NULL DEFAULT 'UNVERIFIED',
    `source` VARCHAR(100) NOT NULL DEFAULT 'EXCEL_IMPORT',
    `notes` VARCHAR(2000) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `MerchantWebsiteDirectory_domain_key`(`domain`),
    INDEX `MerchantWebsiteDirectory_name_idx`(`name`),
    INDEX `MerchantWebsiteDirectory_category_idx`(`category`),
    INDEX `MerchantWebsiteDirectory_status_idx`(`status`),
    INDEX `MerchantWebsiteDirectory_verificationStatus_idx`(`verificationStatus`),
    INDEX `MerchantWebsiteDirectory_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

