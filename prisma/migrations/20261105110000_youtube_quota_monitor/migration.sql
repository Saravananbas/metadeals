-- AlterTable
ALTER TABLE "Deal" ADD COLUMN "youtubeReviewStatus" VARCHAR(50) NOT NULL DEFAULT 'NOT_REQUESTED';
ALTER TABLE "Deal" ADD COLUMN "youtubeLastSearchedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "YouTubeQuotaLedger" (
    "id" TEXT NOT NULL,
    "endpoint" VARCHAR(100) NOT NULL,
    "units" INTEGER NOT NULL,
    "outcome" VARCHAR(30) NOT NULL,
    "dealId" VARCHAR(100),
    "canonicalProduct" VARCHAR(255),
    "adminUserId" VARCHAR(100),
    "errorCategory" VARCHAR(100),
    "errorMessage" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "YouTubeQuotaLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "YouTubeQuotaLedger_createdAt_idx" ON "YouTubeQuotaLedger"("createdAt");

-- CreateIndex
CREATE INDEX "YouTubeQuotaLedger_endpoint_createdAt_idx" ON "YouTubeQuotaLedger"("endpoint", "createdAt");

-- CreateIndex
CREATE INDEX "YouTubeQuotaLedger_outcome_createdAt_idx" ON "YouTubeQuotaLedger"("outcome", "createdAt");

-- CreateIndex
CREATE INDEX "YouTubeQuotaLedger_dealId_idx" ON "YouTubeQuotaLedger"("dealId");

