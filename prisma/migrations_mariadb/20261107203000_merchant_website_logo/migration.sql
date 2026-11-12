-- AlterTable for MariaDB (Staging/Production baseline sync)
ALTER TABLE `MerchantWebsiteDirectory` ADD COLUMN IF NOT EXISTS `logoMediaId` VARCHAR(191) NULL;
ALTER TABLE `MerchantWebsiteDirectory` ADD COLUMN IF NOT EXISTS `logoUrl` VARCHAR(2048) NULL;
ALTER TABLE `MerchantWebsiteDirectory` ADD INDEX IF NOT EXISTS `MerchantWebsiteDirectory_logoMediaId_idx` (`logoMediaId`);

