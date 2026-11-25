-- CreateTable
CREATE TABLE `Bank` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(60) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `logoUrl` VARCHAR(2048) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Bank_slug_key`(`slug`),
    INDEX `Bank_active_sortOrder_idx`(`active`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DealBankOffer` (
    `id` VARCHAR(191) NOT NULL,
    `dealId` VARCHAR(191) NOT NULL,
    `bankId` VARCHAR(191) NOT NULL,
    `cardType` VARCHAR(12) NOT NULL,
    `discountType` VARCHAR(8) NOT NULL,
    `flatMinor` INTEGER NULL,
    `percent` INTEGER NULL,
    `capMinor` INTEGER NULL,
    `minOrderMinor` INTEGER NULL,
    `code` VARCHAR(40) NULL,
    `terms` VARCHAR(300) NULL,
    `validUntil` DATETIME(3) NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DealBankOffer_dealId_position_idx`(`dealId`, `position`),
    INDEX `DealBankOffer_bankId_idx`(`bankId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `DealBankOffer` ADD CONSTRAINT `DealBankOffer_dealId_fkey` FOREIGN KEY (`dealId`) REFERENCES `Deal`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DealBankOffer` ADD CONSTRAINT `DealBankOffer_bankId_fkey` FOREIGN KEY (`bankId`) REFERENCES `Bank`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed: the banks offered in the Bank offers list (logos are uploaded on /admin/banks)
INSERT INTO `Bank` (`id`, `slug`, `name`, `sortOrder`, `updatedAt`) VALUES
(UUID(), 'hdfc-bank', 'HDFC Bank', 10, CURRENT_TIMESTAMP(3)),
(UUID(), 'icici-bank', 'ICICI Bank', 20, CURRENT_TIMESTAMP(3)),
(UUID(), 'sbi', 'State Bank of India (SBI)', 30, CURRENT_TIMESTAMP(3)),
(UUID(), 'axis-bank', 'Axis Bank', 40, CURRENT_TIMESTAMP(3)),
(UUID(), 'kotak-mahindra-bank', 'Kotak Mahindra Bank', 50, CURRENT_TIMESTAMP(3)),
(UUID(), 'idfc-first-bank', 'IDFC FIRST Bank', 60, CURRENT_TIMESTAMP(3)),
(UUID(), 'yes-bank', 'YES Bank', 70, CURRENT_TIMESTAMP(3)),
(UUID(), 'indusind-bank', 'IndusInd Bank', 80, CURRENT_TIMESTAMP(3)),
(UUID(), 'rbl-bank', 'RBL Bank', 90, CURRENT_TIMESTAMP(3)),
(UUID(), 'federal-bank', 'Federal Bank', 100, CURRENT_TIMESTAMP(3)),
(UUID(), 'au-small-finance-bank', 'AU Small Finance Bank', 110, CURRENT_TIMESTAMP(3)),
(UUID(), 'bank-of-baroda', 'Bank of Baroda', 120, CURRENT_TIMESTAMP(3)),
(UUID(), 'punjab-national-bank', 'Punjab National Bank', 130, CURRENT_TIMESTAMP(3)),
(UUID(), 'canara-bank', 'Canara Bank', 140, CURRENT_TIMESTAMP(3)),
(UUID(), 'union-bank-of-india', 'Union Bank of India', 150, CURRENT_TIMESTAMP(3)),
(UUID(), 'indian-bank', 'Indian Bank', 160, CURRENT_TIMESTAMP(3)),
(UUID(), 'bank-of-india', 'Bank of India', 170, CURRENT_TIMESTAMP(3)),
(UUID(), 'hsbc', 'HSBC', 180, CURRENT_TIMESTAMP(3)),
(UUID(), 'standard-chartered', 'Standard Chartered', 190, CURRENT_TIMESTAMP(3)),
(UUID(), 'american-express', 'American Express', 200, CURRENT_TIMESTAMP(3)),
(UUID(), 'citibank', 'Citibank', 210, CURRENT_TIMESTAMP(3)),
(UUID(), 'idbi-bank', 'IDBI Bank', 220, CURRENT_TIMESTAMP(3)),
(UUID(), 'south-indian-bank', 'South Indian Bank', 230, CURRENT_TIMESTAMP(3)),
(UUID(), 'karur-vysya-bank', 'Karur Vysya Bank', 240, CURRENT_TIMESTAMP(3)),
(UUID(), 'bandhan-bank', 'Bandhan Bank', 250, CURRENT_TIMESTAMP(3)),
(UUID(), 'onecard', 'OneCard', 260, CURRENT_TIMESTAMP(3)),
(UUID(), 'slice', 'Slice', 270, CURRENT_TIMESTAMP(3)),
(UUID(), 'amazon-pay-icici', 'Amazon Pay ICICI', 280, CURRENT_TIMESTAMP(3)),
(UUID(), 'flipkart-axis-bank', 'Flipkart Axis Bank', 290, CURRENT_TIMESTAMP(3));
