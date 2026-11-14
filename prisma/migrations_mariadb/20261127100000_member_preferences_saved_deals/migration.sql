-- Member preferences and server-side saved deals: additive only (two new tables). No existing data is changed or removed.

-- CreateTable
CREATE TABLE `CustomerPreference` (
    `customerId` VARCHAR(191) NOT NULL,
    `dealAlerts` BOOLEAN NOT NULL DEFAULT true,
    `emailUpdates` BOOLEAN NOT NULL DEFAULT true,
    `frequency` VARCHAR(10) NOT NULL DEFAULT 'IMMEDIATE',
    `categorySlugs` VARCHAR(1000) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`customerId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SavedDeal` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `dealId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SavedDeal_customerId_createdAt_idx`(`customerId`, `createdAt`),
    UNIQUE INDEX `SavedDeal_customerId_dealId_key`(`customerId`, `dealId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CustomerPreference` ADD CONSTRAINT `CustomerPreference_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SavedDeal` ADD CONSTRAINT `SavedDeal_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SavedDeal` ADD CONSTRAINT `SavedDeal_dealId_fkey` FOREIGN KEY (`dealId`) REFERENCES `Deal`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
