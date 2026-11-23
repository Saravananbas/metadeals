-- AlterTable
ALTER TABLE `AffiliateClick` ADD COLUMN `provider` VARCHAR(24) NULL;

-- CreateTable
CREATE TABLE `MerchantAffiliateConfig` (
    `id` VARCHAR(191) NOT NULL,
    `merchantId` VARCHAR(191) NOT NULL,
    `mode` VARCHAR(12) NOT NULL,
    `provider` VARCHAR(24) NOT NULL,
    `publicId` VARCHAR(120) NULL,
    `linkTemplate` VARCHAR(1000) NULL,
    `credentialsEncrypted` TEXT NULL,
    `apiEnabled` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MerchantAffiliateConfig_merchantId_key`(`merchantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MerchantAffiliateConfig` ADD CONSTRAINT `MerchantAffiliateConfig_merchantId_fkey` FOREIGN KEY (`merchantId`) REFERENCES `Merchant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

