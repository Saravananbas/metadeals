-- CreateTable
CREATE TABLE `MerchantBankOffer` (
    `id` VARCHAR(191) NOT NULL,
    `merchantId` VARCHAR(191) NOT NULL,
    `bankId` VARCHAR(191) NOT NULL,
    `cardType` VARCHAR(12) NOT NULL,
    `discountType` VARCHAR(8) NOT NULL,
    `flatMinor` INTEGER NULL,
    `percent` INTEGER NULL,
    `capMinor` INTEGER NULL,
    `minOrderMinor` INTEGER NULL,
    `code` VARCHAR(40) NULL,
    `terms` VARCHAR(300) NULL,
    `startsOn` VARCHAR(10) NOT NULL,
    `endsOn` VARCHAR(10) NULL,
    `weekdays` VARCHAR(20) NOT NULL DEFAULT '',
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MerchantBankOffer_merchantId_active_idx`(`merchantId`, `active`),
    INDEX `MerchantBankOffer_bankId_idx`(`bankId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MerchantBankOffer` ADD CONSTRAINT `MerchantBankOffer_merchantId_fkey` FOREIGN KEY (`merchantId`) REFERENCES `Merchant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MerchantBankOffer` ADD CONSTRAINT `MerchantBankOffer_bankId_fkey` FOREIGN KEY (`bankId`) REFERENCES `Bank`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
┌─────────────────────────────────────────────────────────┐
│  Update available 7.10.1 -> 8.0.0-rc.35                 │
│                                                         │
│  This is a major update - please follow the guide at    │
│  https://pris.ly/d/major-version-upgrade                │
│                                                         │
│  Run the following to update                            │
│    npm i --save-dev prisma@latest                       │
│    npm i @prisma/client@latest                          │
└─────────────────────────────────────────────────────────┘
