CREATE TABLE IF NOT EXISTS `DealComment` (
  `id` VARCHAR(191) NOT NULL,
  `dealId` VARCHAR(191) NOT NULL,
  `authorName` VARCHAR(80) NOT NULL DEFAULT 'Guest',
  `content` VARCHAR(1000) NOT NULL,
  `authorIpHash` CHAR(64) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `DealComment_dealId_createdAt_idx` (`dealId`, `createdAt`),
  INDEX `DealComment_authorIpHash_createdAt_idx` (`authorIpHash`, `createdAt`),
  CONSTRAINT `DealComment_dealId_fkey` FOREIGN KEY (`dealId`) REFERENCES `Deal` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
