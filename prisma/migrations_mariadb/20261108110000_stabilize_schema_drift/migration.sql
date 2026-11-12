-- AlterTable
ALTER TABLE `Customer` ADD COLUMN IF NOT EXISTS `image` VARCHAR(1024) NULL,
    MODIFY `emailVerifiedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `CustomerIdentity` ADD COLUMN IF NOT EXISTS `avatarUrl` VARCHAR(1024) NULL,
    ADD COLUMN IF NOT EXISTS `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS `email` VARCHAR(191) NULL,
    ADD COLUMN IF NOT EXISTS `name` VARCHAR(191) NULL,
    ADD COLUMN IF NOT EXISTS `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
UPDATE `CustomerIdentity` SET `updatedAt` = COALESCE(`updatedAt`, `createdAt`, CURRENT_TIMESTAMP(3)) WHERE `updatedAt` IS NULL;
ALTER TABLE `CustomerIdentity` MODIFY COLUMN `updatedAt` DATETIME(3) NOT NULL;
ALTER TABLE `CustomerIdentity` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- AlterTable
ALTER TABLE `Deal` ADD COLUMN IF NOT EXISTS `couponCode` VARCHAR(50) NULL;

-- AlterTable
ALTER TABLE `MerchantWebsiteDirectory` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- CreateTable
CREATE TABLE IF NOT EXISTS `ProductMaster` (
    `id` VARCHAR(191) NOT NULL,
    `canonicalTitle` VARCHAR(500) NOT NULL,
    `brand` VARCHAR(150) NOT NULL,
    `categorySlug` VARCHAR(100) NULL,
    `gtin` VARCHAR(50) NULL,
    `mpn` VARCHAR(100) NULL,
    `modelNumber` VARCHAR(100) NULL,
    `description` TEXT NULL,
    `defaultImageId` VARCHAR(128) NULL,
    `verifiedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ProductMaster_gtin_key`(`gtin`),
    INDEX `ProductMaster_brand_canonicalTitle_idx`(`brand`, `canonicalTitle`),
    INDEX `ProductMaster_categorySlug_idx`(`categorySlug`),
    INDEX `ProductMaster_gtin_idx`(`gtin`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `ProductVariant` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `variantKey` VARCHAR(150) NOT NULL,
    `title` VARCHAR(500) NOT NULL,
    `color` VARCHAR(100) NULL,
    `size` VARCHAR(50) NULL,
    `storageCapacity` VARCHAR(50) NULL,
    `condition` VARCHAR(50) NOT NULL DEFAULT 'NEW',
    `asin` VARCHAR(20) NULL,
    `fsn` VARCHAR(30) NULL,
    `sku` VARCHAR(100) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ProductVariant_asin_idx`(`asin`),
    INDEX `ProductVariant_fsn_idx`(`fsn`),
    UNIQUE INDEX `ProductVariant_productId_variantKey_key`(`productId`, `variantKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `ProductOffer` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `variantId` VARCHAR(191) NULL,
    `merchantSlug` VARCHAR(60) NOT NULL,
    `sellerName` VARCHAR(150) NULL,
    `sellerRating` DOUBLE NULL,
    `retailerUrl` VARCHAR(2048) NOT NULL,
    `inStock` BOOLEAN NOT NULL DEFAULT true,
    `currentPricePaise` INTEGER NOT NULL,
    `mrpPaise` INTEGER NOT NULL,
    `lastCheckedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ProductOffer_merchantSlug_inStock_idx`(`merchantSlug`, `inStock`),
    INDEX `ProductOffer_productId_variantId_idx`(`productId`, `variantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `PriceObservationRecord` (
    `id` VARCHAR(191) NOT NULL,
    `variantId` VARCHAR(191) NULL,
    `merchantSlug` VARCHAR(60) NOT NULL,
    `sellerName` VARCHAR(150) NULL,
    `url` VARCHAR(2048) NOT NULL,
    `mrpPaise` INTEGER NOT NULL,
    `sellingPricePaise` INTEGER NOT NULL,
    `couponPricePaise` INTEGER NULL,
    `bankOfferPaise` INTEGER NULL,
    `deliveryFeePaise` INTEGER NOT NULL DEFAULT 0,
    `effectivePricePaise` INTEGER NOT NULL,
    `currency` CHAR(3) NOT NULL DEFAULT 'INR',
    `extractionMethod` VARCHAR(60) NOT NULL,
    `isAvailable` BOOLEAN NOT NULL DEFAULT true,
    `observedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PriceObservationRecord_variantId_observedAt_idx`(`variantId`, `observedAt`),
    INDEX `PriceObservationRecord_merchantSlug_observedAt_idx`(`merchantSlug`, `observedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `SourceHealthRecord` (
    `id` VARCHAR(191) NOT NULL,
    `connectorCode` VARCHAR(60) NOT NULL,
    `state` ENUM('HEALTHY', 'DEGRADED', 'SUSPENDED') NOT NULL DEFAULT 'HEALTHY',
    `totalRequests` INTEGER NOT NULL DEFAULT 0,
    `successfulRequests` INTEGER NOT NULL DEFAULT 0,
    `consecutiveFailures` INTEGER NOT NULL DEFAULT 0,
    `lastSuccessAt` DATETIME(3) NULL,
    `lastFailureAt` DATETIME(3) NULL,
    `lastFailureReason` VARCHAR(500) NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `SourceHealthRecord_connectorCode_key`(`connectorCode`),
    INDEX `SourceHealthRecord_state_idx`(`state`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `PublicationAuthorization` (
    `id` VARCHAR(191) NOT NULL,
    `candidateId` VARCHAR(128) NOT NULL,
    `authorizedByAdmin` VARCHAR(100) NULL,
    `approvalToken` VARCHAR(128) NOT NULL,
    `status` ENUM('PENDING_APPROVAL', 'APPROVED', 'CLAIMED', 'PUBLISHING', 'PUBLISHED', 'REJECTED', 'EXPIRED', 'RECOVERY_REQUIRED') NOT NULL DEFAULT 'PENDING_APPROVAL',
    `isPriceErrorSuspected` BOOLEAN NOT NULL DEFAULT false,
    `confidenceScore` DOUBLE NOT NULL,
    `attractivenessScore` DOUBLE NOT NULL,
    `approvedAt` DATETIME(3) NULL,
    `publishedAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PublicationAuthorization_candidateId_key`(`candidateId`),
    UNIQUE INDEX `PublicationAuthorization_approvalToken_key`(`approvalToken`),
    INDEX `PublicationAuthorization_status_idx`(`status`),
    INDEX `PublicationAuthorization_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `ShadowCandidate` (
    `id` VARCHAR(191) NOT NULL,
    `competitorSource` VARCHAR(100) NOT NULL,
    `sourceUrl` VARCHAR(2048) NOT NULL,
    `title` VARCHAR(500) NOT NULL,
    `pricePaise` INTEGER NOT NULL,
    `mrpPaise` INTEGER NOT NULL,
    `brand` VARCHAR(150) NULL,
    `matchedProductId` VARCHAR(128) NULL,
    `matchedVariantId` VARCHAR(128) NULL,
    `dealScore` DOUBLE NOT NULL DEFAULT 0,
    `discoveredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ShadowCandidate_competitorSource_discoveredAt_idx`(`competitorSource`, `discoveredAt`),
    INDEX `ShadowCandidate_matchedProductId_idx`(`matchedProductId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `DealLifecycleEvent` (
    `id` VARCHAR(191) NOT NULL,
    `dealId` VARCHAR(128) NOT NULL,
    `eventType` VARCHAR(60) NOT NULL,
    `previousState` JSON NULL,
    `newState` JSON NULL,
    `triggeredBy` VARCHAR(100) NOT NULL,
    `recordedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DealLifecycleEvent_dealId_recordedAt_idx`(`dealId`, `recordedAt`),
    INDEX `DealLifecycleEvent_eventType_recordedAt_idx`(`eventType`, `recordedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Ensure indexes exist when the table was created outside Prisma Migrate.
ALTER TABLE `ProductMaster` ADD UNIQUE INDEX IF NOT EXISTS `ProductMaster_gtin_key` (`gtin`);
ALTER TABLE `ProductMaster` ADD INDEX IF NOT EXISTS `ProductMaster_brand_canonicalTitle_idx` (`brand`, `canonicalTitle`);
ALTER TABLE `ProductMaster` ADD INDEX IF NOT EXISTS `ProductMaster_categorySlug_idx` (`categorySlug`);
ALTER TABLE `ProductMaster` ADD INDEX IF NOT EXISTS `ProductMaster_gtin_idx` (`gtin`);
ALTER TABLE `ProductVariant` ADD INDEX IF NOT EXISTS `ProductVariant_asin_idx` (`asin`);
ALTER TABLE `ProductVariant` ADD INDEX IF NOT EXISTS `ProductVariant_fsn_idx` (`fsn`);
ALTER TABLE `ProductVariant` ADD UNIQUE INDEX IF NOT EXISTS `ProductVariant_productId_variantKey_key` (`productId`, `variantKey`);
ALTER TABLE `ProductOffer` ADD INDEX IF NOT EXISTS `ProductOffer_merchantSlug_inStock_idx` (`merchantSlug`, `inStock`);
ALTER TABLE `ProductOffer` ADD INDEX IF NOT EXISTS `ProductOffer_productId_variantId_idx` (`productId`, `variantId`);
ALTER TABLE `PriceObservationRecord` ADD INDEX IF NOT EXISTS `PriceObservationRecord_variantId_observedAt_idx` (`variantId`, `observedAt`);
ALTER TABLE `PriceObservationRecord` ADD INDEX IF NOT EXISTS `PriceObservationRecord_merchantSlug_observedAt_idx` (`merchantSlug`, `observedAt`);
ALTER TABLE `SourceHealthRecord` ADD UNIQUE INDEX IF NOT EXISTS `SourceHealthRecord_connectorCode_key` (`connectorCode`);
ALTER TABLE `SourceHealthRecord` ADD INDEX IF NOT EXISTS `SourceHealthRecord_state_idx` (`state`);
ALTER TABLE `PublicationAuthorization` ADD UNIQUE INDEX IF NOT EXISTS `PublicationAuthorization_candidateId_key` (`candidateId`);
ALTER TABLE `PublicationAuthorization` ADD UNIQUE INDEX IF NOT EXISTS `PublicationAuthorization_approvalToken_key` (`approvalToken`);
ALTER TABLE `PublicationAuthorization` ADD INDEX IF NOT EXISTS `PublicationAuthorization_status_idx` (`status`);
ALTER TABLE `PublicationAuthorization` ADD INDEX IF NOT EXISTS `PublicationAuthorization_expiresAt_idx` (`expiresAt`);
ALTER TABLE `ShadowCandidate` ADD INDEX IF NOT EXISTS `ShadowCandidate_competitorSource_discoveredAt_idx` (`competitorSource`, `discoveredAt`);
ALTER TABLE `ShadowCandidate` ADD INDEX IF NOT EXISTS `ShadowCandidate_matchedProductId_idx` (`matchedProductId`);
ALTER TABLE `DealLifecycleEvent` ADD INDEX IF NOT EXISTS `DealLifecycleEvent_dealId_recordedAt_idx` (`dealId`, `recordedAt`);
ALTER TABLE `DealLifecycleEvent` ADD INDEX IF NOT EXISTS `DealLifecycleEvent_eventType_recordedAt_idx` (`eventType`, `recordedAt`);

-- AddForeignKey
ALTER TABLE `ProductVariant` ADD CONSTRAINT `ProductVariant_productId_fkey` FOREIGN KEY IF NOT EXISTS (`productId`) REFERENCES `ProductMaster`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductOffer` ADD CONSTRAINT `ProductOffer_productId_fkey` FOREIGN KEY IF NOT EXISTS (`productId`) REFERENCES `ProductMaster`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductOffer` ADD CONSTRAINT `ProductOffer_variantId_fkey` FOREIGN KEY IF NOT EXISTS (`variantId`) REFERENCES `ProductVariant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PriceObservationRecord` ADD CONSTRAINT `PriceObservationRecord_variantId_fkey` FOREIGN KEY IF NOT EXISTS (`variantId`) REFERENCES `ProductVariant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

