-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('DISCOVERED', 'VALIDATING', 'VERIFIED', 'UNCERTAIN', 'REJECTED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "ScraperJobStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "DealCandidate" (
    "id" TEXT NOT NULL,
    "sourceUrl" VARCHAR(2048) NOT NULL,
    "sourcePlatform" VARCHAR(60) NOT NULL,
    "externalId" VARCHAR(120),
    "rawTitle" VARCHAR(300) NOT NULL,
    "brand" VARCHAR(100),
    "categorySlug" VARCHAR(100) NOT NULL,
    "observedPriceMinor" INTEGER NOT NULL,
    "observedMrpMinor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "discountPercent" INTEGER NOT NULL DEFAULT 0,
    "imageUrl" VARCHAR(2048),
    "sellerName" VARCHAR(150),
    "inStock" BOOLEAN NOT NULL DEFAULT true,
    "confidenceScore" INTEGER NOT NULL DEFAULT 0,
    "status" "CandidateStatus" NOT NULL DEFAULT 'DISCOVERED',
    "rejectionReason" VARCHAR(500),
    "rawData" TEXT,
    "dealId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceObservation" (
    "id" TEXT NOT NULL,
    "dealId" TEXT,
    "candidateId" TEXT,
    "merchantSlug" VARCHAR(100) NOT NULL,
    "priceMinor" INTEGER NOT NULL,
    "mrpMinor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "sourceUrl" VARCHAR(2048) NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScraperJob" (
    "id" TEXT NOT NULL,
    "connectorCode" VARCHAR(60) NOT NULL,
    "status" "ScraperJobStatus" NOT NULL DEFAULT 'RUNNING',
    "itemsFound" INTEGER NOT NULL DEFAULT 0,
    "itemsVerified" INTEGER NOT NULL DEFAULT 0,
    "itemsPublished" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ScraperJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DealCandidate_status_createdAt_idx" ON "DealCandidate"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DealCandidate_sourcePlatform_externalId_idx" ON "DealCandidate"("sourcePlatform", "externalId");

-- CreateIndex
CREATE INDEX "DealCandidate_dealId_idx" ON "DealCandidate"("dealId");

-- CreateIndex
CREATE INDEX "PriceObservation_merchantSlug_observedAt_idx" ON "PriceObservation"("merchantSlug", "observedAt");

-- CreateIndex
CREATE INDEX "PriceObservation_dealId_observedAt_idx" ON "PriceObservation"("dealId", "observedAt");

-- CreateIndex
CREATE INDEX "PriceObservation_candidateId_observedAt_idx" ON "PriceObservation"("candidateId", "observedAt");

-- CreateIndex
CREATE INDEX "ScraperJob_connectorCode_startedAt_idx" ON "ScraperJob"("connectorCode", "startedAt");

-- AddForeignKey
ALTER TABLE "DealCandidate" ADD CONSTRAINT "DealCandidate_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceObservation" ADD CONSTRAINT "PriceObservation_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceObservation" ADD CONSTRAINT "PriceObservation_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "DealCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
