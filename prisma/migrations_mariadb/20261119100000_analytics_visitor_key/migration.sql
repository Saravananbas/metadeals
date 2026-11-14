-- AlterTable (additive: nullable column, existing sessions stay NULL)
ALTER TABLE `AnalyticsSession` ADD COLUMN `visitorKey` VARCHAR(32) NULL;

-- CreateIndex
CREATE INDEX `AnalyticsSession_visitorKey_startedAt_idx` ON `AnalyticsSession`(`visitorKey`, `startedAt`);
