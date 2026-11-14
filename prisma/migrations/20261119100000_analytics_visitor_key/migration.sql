-- AlterTable (additive)
ALTER TABLE "AnalyticsSession" ADD COLUMN "visitorKey" VARCHAR(32);

-- CreateIndex
CREATE INDEX "AnalyticsSession_visitorKey_startedAt_idx" ON "AnalyticsSession"("visitorKey", "startedAt");
