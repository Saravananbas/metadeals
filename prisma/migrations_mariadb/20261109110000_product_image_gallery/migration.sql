CREATE TABLE `DealGalleryImage` (
  `id` VARCHAR(191) NOT NULL,
  `dealId` VARCHAR(191) NOT NULL,
  `mediaId` VARCHAR(191) NOT NULL,
  `position` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `DealGalleryImage_dealId_position_key` (`dealId`, `position`),
  INDEX `DealGalleryImage_mediaId_idx` (`mediaId`),
  CONSTRAINT `DealGalleryImage_dealId_fkey` FOREIGN KEY (`dealId`) REFERENCES `Deal` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `DealGalleryImage_mediaId_fkey` FOREIGN KEY (`mediaId`) REFERENCES `Media` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
