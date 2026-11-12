-- CreateTable
CREATE TABLE `AnalyticsSession` (
    `id` VARCHAR(191) NOT NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `activeSeconds` INTEGER NOT NULL DEFAULT 0,
    `pageCount` INTEGER NOT NULL DEFAULT 0,
    `entryPath` VARCHAR(300) NOT NULL,
    `exitPath` VARCHAR(300) NOT NULL,
    `referrerHost` VARCHAR(150) NULL,
    `utmSource` VARCHAR(100) NULL,
    `utmMedium` VARCHAR(100) NULL,
    `utmCampaign` VARCHAR(100) NULL,
    `channel` VARCHAR(30) NULL,
    `deviceType` VARCHAR(20) NOT NULL,
    `browser` VARCHAR(30) NOT NULL,
    `os` VARCHAR(30) NOT NULL,
    `returning` BOOLEAN NOT NULL DEFAULT false,
    `customerId` VARCHAR(191) NULL,

    INDEX `AnalyticsSession_startedAt_idx`(`startedAt`),
    INDEX `AnalyticsSession_lastSeenAt_idx`(`lastSeenAt`),
    INDEX `AnalyticsSession_customerId_idx`(`customerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AnalyticsEvent` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NULL,
    `visitorHash` VARCHAR(32) NOT NULL,
    `type` VARCHAR(30) NOT NULL,
    `path` VARCHAR(300) NOT NULL,
    `pageType` VARCHAR(20) NOT NULL,
    `dealId` VARCHAR(191) NULL,
    `merchantId` VARCHAR(191) NULL,
    `categoryId` VARCHAR(191) NULL,
    `referrerHost` VARCHAR(150) NULL,
    `channel` VARCHAR(30) NULL,
    `deviceType` VARCHAR(20) NULL,
    `durationSec` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AnalyticsEvent_createdAt_idx`(`createdAt`),
    INDEX `AnalyticsEvent_type_createdAt_idx`(`type`, `createdAt`),
    INDEX `AnalyticsEvent_dealId_createdAt_idx`(`dealId`, `createdAt`),
    INDEX `AnalyticsEvent_merchantId_createdAt_idx`(`merchantId`, `createdAt`),
    INDEX `AnalyticsEvent_sessionId_createdAt_idx`(`sessionId`, `createdAt`),
    INDEX `AnalyticsEvent_pageType_createdAt_idx`(`pageType`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AnalyticsDaily` (
    `id` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `dimension` VARCHAR(20) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `views` INTEGER NOT NULL DEFAULT 0,
    `visitors` INTEGER NOT NULL DEFAULT 0,
    `sessions` INTEGER NOT NULL DEFAULT 0,
    `clicks` INTEGER NOT NULL DEFAULT 0,
    `activeSeconds` INTEGER NOT NULL DEFAULT 0,

    INDEX `AnalyticsDaily_dimension_date_idx`(`dimension`, `date`),
    UNIQUE INDEX `AnalyticsDaily_date_dimension_key_key`(`date`, `dimension`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AnalyticsEvent` ADD CONSTRAINT `AnalyticsEvent_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `AnalyticsSession`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

