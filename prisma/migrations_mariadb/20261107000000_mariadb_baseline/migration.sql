-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `emailVerified` DATETIME(3) NULL,
    `image` VARCHAR(191) NULL,
    `role` ENUM('SUPER_ADMIN', 'ADMIN', 'EDITOR') NOT NULL DEFAULT 'EDITOR',
    `status` ENUM('PENDING_SETUP', 'ACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'PENDING_SETUP',
    `passwordHash` VARCHAR(255) NULL,
    `totpSecretEncrypted` TEXT NULL,
    `totpEnabledAt` DATETIME(3) NULL,
    `lastTotpStep` BIGINT NOT NULL DEFAULT -1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    INDEX `User_role_status_idx`(`role`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Account` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `providerAccountId` VARCHAR(191) NOT NULL,
    `refresh_token` TEXT NULL,
    `access_token` TEXT NULL,
    `expires_at` INTEGER NULL,
    `token_type` VARCHAR(191) NULL,
    `scope` VARCHAR(191) NULL,
    `id_token` TEXT NULL,
    `session_state` VARCHAR(191) NULL,

    INDEX `Account_userId_idx`(`userId`),
    UNIQUE INDEX `Account_provider_providerAccountId_key`(`provider`, `providerAccountId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Session` (
    `id` VARCHAR(191) NOT NULL,
    `sessionToken` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `expires` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Session_sessionToken_key`(`sessionToken`),
    INDEX `Session_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VerificationToken` (
    `identifier` VARCHAR(191) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `expires` DATETIME(3) NOT NULL,

    UNIQUE INDEX `VerificationToken_token_key`(`token`),
    UNIQUE INDEX `VerificationToken_identifier_token_key`(`identifier`, `token`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuthSession` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastActivityAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,
    `absoluteExpiresAt` DATETIME(3) NOT NULL,
    `ipHash` CHAR(64) NULL,
    `userAgent` VARCHAR(512) NULL,

    UNIQUE INDEX `AuthSession_tokenHash_key`(`tokenHash`),
    INDEX `AuthSession_userId_expiresAt_idx`(`userId`, `expiresAt`),
    INDEX `AuthSession_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RecoveryCode` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `codeHash` VARCHAR(255) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `RecoveryCode_userId_usedAt_idx`(`userId`, `usedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuthToken` (
    `id` VARCHAR(191) NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `purpose` ENUM('ACCOUNT_SETUP', 'PASSWORD_RESET', 'SUPER_ADMIN_BOOTSTRAP') NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `role` ENUM('SUPER_ADMIN', 'ADMIN', 'EDITOR') NULL,
    `createdById` VARCHAR(191) NULL,
    `passwordHash` VARCHAR(255) NULL,
    `totpSecretEncrypted` TEXT NULL,
    `emailDeliveryVerified` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,
    `startedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,

    UNIQUE INDEX `AuthToken_tokenHash_key`(`tokenHash`),
    INDEX `AuthToken_email_purpose_expiresAt_idx`(`email`, `purpose`, `expiresAt`),
    INDEX `AuthToken_userId_purpose_idx`(`userId`, `purpose`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuthRateLimit` (
    `subjectHash` CHAR(64) NOT NULL,
    `failures` INTEGER NOT NULL DEFAULT 0,
    `lockedUntil` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AuthRateLimit_updatedAt_idx`(`updatedAt`),
    INDEX `AuthRateLimit_lockedUntil_idx`(`lockedUntil`),
    PRIMARY KEY (`subjectHash`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BootstrapState` (
    `id` VARCHAR(191) NOT NULL,
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditEvent` (
    `id` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `action` VARCHAR(80) NOT NULL,
    `targetId` VARCHAR(128) NULL,
    `success` BOOLEAN NOT NULL,
    `requestId` VARCHAR(64) NULL,
    `ipHash` CHAR(64) NULL,
    `userAgent` VARCHAR(512) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditEvent_createdAt_idx`(`createdAt`),
    INDEX `AuditEvent_actorId_createdAt_idx`(`actorId`, `createdAt`),
    INDEX `AuditEvent_action_createdAt_idx`(`action`, `createdAt`),
    INDEX `AuditEvent_targetId_idx`(`targetId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Category` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(100) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `parentId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Category_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Merchant` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(100) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `websiteUrl` VARCHAR(2048) NOT NULL,
    `affiliateHosts` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Merchant_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AffiliateClick` (
    `id` VARCHAR(191) NOT NULL,
    `dealId` VARCHAR(191) NOT NULL,
    `optionId` VARCHAR(191) NULL,
    `merchantId` VARCHAR(191) NOT NULL,
    `channel` VARCHAR(30) NOT NULL,
    `actorHash` CHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AffiliateClick_dealId_createdAt_idx`(`dealId`, `createdAt`),
    INDEX `AffiliateClick_merchantId_createdAt_idx`(`merchantId`, `createdAt`),
    INDEX `AffiliateClick_actorHash_createdAt_idx`(`actorHash`, `createdAt`),
    INDEX `AffiliateClick_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AffiliateTransaction` (
    `id` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(60) NOT NULL,
    `externalId` VARCHAR(120) NOT NULL,
    `dealId` VARCHAR(191) NULL,
    `status` VARCHAR(20) NOT NULL,
    `commissionMinor` INTEGER NOT NULL,
    `currency` CHAR(3) NOT NULL DEFAULT 'INR',
    `reportedAt` DATETIME(3) NOT NULL,
    `enteredById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AffiliateTransaction_status_reportedAt_idx`(`status`, `reportedAt`),
    UNIQUE INDEX `AffiliateTransaction_provider_externalId_key`(`provider`, `externalId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Media` (
    `id` VARCHAR(191) NOT NULL,
    `storageKey` VARCHAR(160) NOT NULL,
    `provider` VARCHAR(10) NOT NULL,
    `mimeType` VARCHAR(40) NOT NULL,
    `byteSize` INTEGER NOT NULL,
    `width` INTEGER NOT NULL,
    `height` INTEGER NOT NULL,
    `alt` VARCHAR(240) NOT NULL,
    `uploadedById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Media_storageKey_key`(`storageKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Deal` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(120) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `brand` VARCHAR(100) NOT NULL,
    `description` VARCHAR(2000) NOT NULL,
    `categoryId` VARCHAR(191) NOT NULL,
    `merchantId` VARCHAR(191) NOT NULL,
    `mediaId` VARCHAR(191) NOT NULL,
    `mrpMinor` INTEGER NOT NULL,
    `priceMinor` INTEGER NOT NULL,
    `currency` CHAR(3) NOT NULL DEFAULT 'INR',
    `rating` DOUBLE NULL,
    `reviewCount` INTEGER NULL,
    `viewCount` INTEGER NOT NULL DEFAULT 0,
    `shareCount` INTEGER NOT NULL DEFAULT 0,
    `ratingSource` VARCHAR(200) NULL,
    `productUrl` VARCHAR(2048) NOT NULL,
    `affiliateUrl` VARCHAR(2048) NULL,
    `status` ENUM('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'EXPIRED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `publishedAt` DATETIME(3) NULL,
    `startsAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NULL,
    `featured` BOOLEAN NOT NULL DEFAULT false,
    `trending` BOOLEAN NOT NULL DEFAULT false,
    `everPublished` BOOLEAN NOT NULL DEFAULT false,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdById` VARCHAR(191) NOT NULL,
    `updatedById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `youtubeReviewStatus` VARCHAR(50) NOT NULL DEFAULT 'NOT_REQUESTED',
    `youtubeLastSearchedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Deal_slug_key`(`slug`),
    INDEX `Deal_status_publishedAt_id_idx`(`status`, `publishedAt`, `id`),
    INDEX `Deal_categoryId_status_publishedAt_idx`(`categoryId`, `status`, `publishedAt`),
    INDEX `Deal_merchantId_status_publishedAt_idx`(`merchantId`, `status`, `publishedAt`),
    INDEX `Deal_expiresAt_idx`(`expiresAt`),
    INDEX `Deal_featured_status_publishedAt_idx`(`featured`, `status`, `publishedAt`),
    INDEX `Deal_trending_status_publishedAt_idx`(`trending`, `status`, `publishedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PurchaseOption` (
    `id` VARCHAR(191) NOT NULL,
    `dealId` VARCHAR(191) NOT NULL,
    `merchantId` VARCHAR(191) NOT NULL,
    `priceMinor` INTEGER NOT NULL,
    `productUrl` VARCHAR(2048) NOT NULL,
    `affiliateUrl` VARCHAR(2048) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PurchaseOption_dealId_merchantId_key`(`dealId`, `merchantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Customer` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(255) NULL,
    `emailVerifiedAt` DATETIME(3) NOT NULL,
    `disabledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Customer_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CustomerIdentity` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(191) NOT NULL,

    INDEX `CustomerIdentity_customerId_idx`(`customerId`),
    UNIQUE INDEX `CustomerIdentity_provider_subject_key`(`provider`, `subject`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CustomerSignupChallenge` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `codeHash` CHAR(64) NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `consumedAt` DATETIME(3) NULL,

    UNIQUE INDEX `CustomerSignupChallenge_email_key`(`email`),
    INDEX `CustomerSignupChallenge_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CustomerRateLimit` (
    `key` CHAR(64) NOT NULL,
    `count` INTEGER NOT NULL DEFAULT 1,
    `expiresAt` DATETIME(3) NOT NULL,

    INDEX `CustomerRateLimit_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DistributionDestination` (
    `id` VARCHAR(191) NOT NULL,
    `platform` ENUM('TELEGRAM', 'WHATSAPP') NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `destinationId` VARCHAR(120) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `DistributionDestination_platform_destinationId_key`(`platform`, `destinationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DistributionPost` (
    `id` VARCHAR(191) NOT NULL,
    `dealId` VARCHAR(191) NOT NULL,
    `destinationId` VARCHAR(191) NOT NULL,
    `platform` ENUM('TELEGRAM', 'WHATSAPP') NOT NULL,
    `status` ENUM('QUEUED', 'SENT', 'FAILED', 'SKIPPED') NOT NULL DEFAULT 'QUEUED',
    `messageContent` TEXT NOT NULL,
    `externalMessageId` VARCHAR(120) NULL,
    `errorMessage` TEXT NULL,
    `sentAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `DistributionPost_status_createdAt_idx`(`status`, `createdAt`),
    UNIQUE INDEX `DistributionPost_dealId_destinationId_key`(`dealId`, `destinationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DealCandidate` (
    `id` VARCHAR(191) NOT NULL,
    `sourceUrl` VARCHAR(2048) NOT NULL,
    `sourcePlatform` VARCHAR(60) NOT NULL,
    `externalId` VARCHAR(120) NULL,
    `rawTitle` VARCHAR(300) NOT NULL,
    `brand` VARCHAR(100) NULL,
    `categorySlug` VARCHAR(100) NOT NULL,
    `observedPriceMinor` INTEGER NOT NULL,
    `observedMrpMinor` INTEGER NOT NULL,
    `currency` CHAR(3) NOT NULL DEFAULT 'INR',
    `discountPercent` INTEGER NOT NULL DEFAULT 0,
    `imageUrl` VARCHAR(2048) NULL,
    `sellerName` VARCHAR(150) NULL,
    `inStock` BOOLEAN NOT NULL DEFAULT true,
    `confidenceScore` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('DISCOVERED', 'VALIDATING', 'VERIFIED', 'UNCERTAIN', 'REJECTED', 'PUBLISHED') NOT NULL DEFAULT 'DISCOVERED',
    `rejectionReason` VARCHAR(500) NULL,
    `rawData` TEXT NULL,
    `dealId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `DealCandidate_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `DealCandidate_sourcePlatform_externalId_idx`(`sourcePlatform`, `externalId`),
    INDEX `DealCandidate_dealId_idx`(`dealId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PriceObservation` (
    `id` VARCHAR(191) NOT NULL,
    `dealId` VARCHAR(191) NULL,
    `candidateId` VARCHAR(191) NULL,
    `merchantSlug` VARCHAR(100) NOT NULL,
    `priceMinor` INTEGER NOT NULL,
    `mrpMinor` INTEGER NOT NULL,
    `currency` CHAR(3) NOT NULL DEFAULT 'INR',
    `sourceUrl` VARCHAR(2048) NOT NULL,
    `observedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PriceObservation_merchantSlug_observedAt_idx`(`merchantSlug`, `observedAt`),
    INDEX `PriceObservation_dealId_observedAt_idx`(`dealId`, `observedAt`),
    INDEX `PriceObservation_candidateId_observedAt_idx`(`candidateId`, `observedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ScraperJob` (
    `id` VARCHAR(191) NOT NULL,
    `connectorCode` VARCHAR(60) NOT NULL,
    `status` ENUM('RUNNING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'RUNNING',
    `itemsFound` INTEGER NOT NULL DEFAULT 0,
    `itemsVerified` INTEGER NOT NULL DEFAULT 0,
    `itemsPublished` INTEGER NOT NULL DEFAULT 0,
    `errorMessage` TEXT NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,

    INDEX `ScraperJob_connectorCode_startedAt_idx`(`connectorCode`, `startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProductExtractionLog` (
    `id` VARCHAR(191) NOT NULL,
    `adminUserId` VARCHAR(191) NULL,
    `retailer` VARCHAR(60) NOT NULL,
    `originalUrl` VARCHAR(2048) NOT NULL,
    `extractionStatus` VARCHAR(40) NOT NULL,
    `fieldsSummary` JSON NULL,
    `sourceMethod` VARCHAR(60) NOT NULL,
    `errorCode` VARCHAR(60) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ProductExtractionLog_retailer_createdAt_idx`(`retailer`, `createdAt`),
    INDEX `ProductExtractionLog_adminUserId_createdAt_idx`(`adminUserId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DealVideoReview` (
    `id` VARCHAR(191) NOT NULL,
    `dealId` VARCHAR(191) NOT NULL,
    `videoId` VARCHAR(50) NOT NULL,
    `title` VARCHAR(300) NOT NULL,
    `channelTitle` VARCHAR(150) NOT NULL,
    `channelId` VARCHAR(100) NULL,
    `thumbnailUrl` VARCHAR(1000) NOT NULL,
    `publishedAt` DATETIME(3) NULL,
    `duration` VARCHAR(30) NULL,
    `viewCount` INTEGER NOT NULL DEFAULT 0,
    `likeCount` INTEGER NULL,
    `language` VARCHAR(50) NOT NULL DEFAULT 'English',
    `relevanceScore` DOUBLE NOT NULL DEFAULT 0,
    `rankingPosition` INTEGER NOT NULL DEFAULT 1,
    `isEmbeddable` BOOLEAN NOT NULL DEFAULT true,
    `isPinned` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `lastFetchedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `DealVideoReview_dealId_isActive_rankingPosition_idx`(`dealId`, `isActive`, `rankingPosition`),
    INDEX `DealVideoReview_dealId_language_idx`(`dealId`, `language`),
    UNIQUE INDEX `DealVideoReview_dealId_videoId_key`(`dealId`, `videoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `YouTubeQuotaLedger` (
    `id` VARCHAR(191) NOT NULL,
    `endpoint` VARCHAR(100) NOT NULL,
    `units` INTEGER NOT NULL,
    `outcome` VARCHAR(30) NOT NULL,
    `dealId` VARCHAR(100) NULL,
    `canonicalProduct` VARCHAR(255) NULL,
    `adminUserId` VARCHAR(100) NULL,
    `errorCategory` VARCHAR(100) NULL,
    `errorMessage` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `YouTubeQuotaLedger_createdAt_idx`(`createdAt`),
    INDEX `YouTubeQuotaLedger_endpoint_createdAt_idx`(`endpoint`, `createdAt`),
    INDEX `YouTubeQuotaLedger_outcome_createdAt_idx`(`outcome`, `createdAt`),
    INDEX `YouTubeQuotaLedger_dealId_idx`(`dealId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Account` ADD CONSTRAINT `Account_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Session` ADD CONSTRAINT `Session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuthSession` ADD CONSTRAINT `AuthSession_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RecoveryCode` ADD CONSTRAINT `RecoveryCode_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuthToken` ADD CONSTRAINT `AuthToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuthToken` ADD CONSTRAINT `AuthToken_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditEvent` ADD CONSTRAINT `AuditEvent_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Category` ADD CONSTRAINT `Category_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `Category`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Media` ADD CONSTRAINT `Media_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Deal` ADD CONSTRAINT `Deal_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `Category`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Deal` ADD CONSTRAINT `Deal_merchantId_fkey` FOREIGN KEY (`merchantId`) REFERENCES `Merchant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Deal` ADD CONSTRAINT `Deal_mediaId_fkey` FOREIGN KEY (`mediaId`) REFERENCES `Media`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Deal` ADD CONSTRAINT `Deal_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Deal` ADD CONSTRAINT `Deal_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PurchaseOption` ADD CONSTRAINT `PurchaseOption_dealId_fkey` FOREIGN KEY (`dealId`) REFERENCES `Deal`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PurchaseOption` ADD CONSTRAINT `PurchaseOption_merchantId_fkey` FOREIGN KEY (`merchantId`) REFERENCES `Merchant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CustomerIdentity` ADD CONSTRAINT `CustomerIdentity_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DistributionPost` ADD CONSTRAINT `DistributionPost_destinationId_fkey` FOREIGN KEY (`destinationId`) REFERENCES `DistributionDestination`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DealCandidate` ADD CONSTRAINT `DealCandidate_dealId_fkey` FOREIGN KEY (`dealId`) REFERENCES `Deal`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PriceObservation` ADD CONSTRAINT `PriceObservation_dealId_fkey` FOREIGN KEY (`dealId`) REFERENCES `Deal`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PriceObservation` ADD CONSTRAINT `PriceObservation_candidateId_fkey` FOREIGN KEY (`candidateId`) REFERENCES `DealCandidate`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DealVideoReview` ADD CONSTRAINT `DealVideoReview_dealId_fkey` FOREIGN KEY (`dealId`) REFERENCES `Deal`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
