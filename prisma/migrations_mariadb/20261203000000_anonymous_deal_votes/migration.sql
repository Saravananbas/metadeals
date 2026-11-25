-- AlterTable
ALTER TABLE `DealVote` ADD COLUMN `visitorId` VARCHAR(40) NULL,
    MODIFY `customerId` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `DealVote_visitorId_dealId_key` ON `DealVote`(`visitorId`, `dealId`);
