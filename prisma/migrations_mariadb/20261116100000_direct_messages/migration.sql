-- CreateTable
CREATE TABLE `DmThread` (
    `id` VARCHAR(191) NOT NULL,
    `profileLowId` VARCHAR(191) NOT NULL,
    `profileHighId` VARCHAR(191) NOT NULL,
    `requestedById` VARCHAR(191) NOT NULL,
    `status` ENUM('REQUESTED', 'ACCEPTED', 'DECLINED') NOT NULL DEFAULT 'REQUESTED',
    `lastMessageAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lowReadAt` DATETIME(3) NULL,
    `highReadAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DmThread_profileLowId_lastMessageAt_idx`(`profileLowId`, `lastMessageAt`),
    INDEX `DmThread_profileHighId_lastMessageAt_idx`(`profileHighId`, `lastMessageAt`),
    UNIQUE INDEX `DmThread_profileLowId_profileHighId_key`(`profileLowId`, `profileHighId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DmMessage` (
    `id` VARCHAR(191) NOT NULL,
    `threadId` VARCHAR(191) NOT NULL,
    `senderId` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `deleted` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DmMessage_threadId_createdAt_idx`(`threadId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DmBlock` (
    `id` VARCHAR(191) NOT NULL,
    `blockerId` VARCHAR(191) NOT NULL,
    `blockedId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DmBlock_blockedId_idx`(`blockedId`),
    UNIQUE INDEX `DmBlock_blockerId_blockedId_key`(`blockerId`, `blockedId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DmReport` (
    `id` VARCHAR(191) NOT NULL,
    `reporterId` VARCHAR(191) NOT NULL,
    `reportedProfileId` VARCHAR(191) NOT NULL,
    `threadId` VARCHAR(191) NOT NULL,
    `messageId` VARCHAR(191) NOT NULL,
    `category` ENUM('SPAM', 'SCAM', 'HARASSMENT', 'HATE', 'ILLEGAL', 'PRIVACY', 'IMPERSONATION', 'OFF_TOPIC', 'OTHER') NOT NULL,
    `details` VARCHAR(500) NULL,
    `snapshot` VARCHAR(2000) NOT NULL,
    `status` ENUM('OPEN', 'RESOLVED', 'DISMISSED', 'ESCALATED') NOT NULL DEFAULT 'OPEN',
    `version` INTEGER NOT NULL DEFAULT 1,
    `resolvedById` VARCHAR(191) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `resolution` VARCHAR(300) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DmReport_status_createdAt_idx`(`status`, `createdAt`),
    UNIQUE INDEX `DmReport_reporterId_messageId_key`(`reporterId`, `messageId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `DmThread` ADD CONSTRAINT `DmThread_profileLowId_fkey` FOREIGN KEY (`profileLowId`) REFERENCES `ForumProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DmThread` ADD CONSTRAINT `DmThread_profileHighId_fkey` FOREIGN KEY (`profileHighId`) REFERENCES `ForumProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DmMessage` ADD CONSTRAINT `DmMessage_threadId_fkey` FOREIGN KEY (`threadId`) REFERENCES `DmThread`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DmMessage` ADD CONSTRAINT `DmMessage_senderId_fkey` FOREIGN KEY (`senderId`) REFERENCES `ForumProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DmBlock` ADD CONSTRAINT `DmBlock_blockerId_fkey` FOREIGN KEY (`blockerId`) REFERENCES `ForumProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DmBlock` ADD CONSTRAINT `DmBlock_blockedId_fkey` FOREIGN KEY (`blockedId`) REFERENCES `ForumProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
