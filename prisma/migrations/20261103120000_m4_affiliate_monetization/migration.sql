-- AlterTable
ALTER TABLE "Merchant" ADD COLUMN "affiliateHosts" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "AffiliateClick" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "optionId" TEXT,
    "merchantId" TEXT NOT NULL,
    "channel" VARCHAR(30) NOT NULL,
    "actorHash" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateClick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AffiliateTransaction" (
    "id" TEXT NOT NULL,
    "provider" VARCHAR(60) NOT NULL,
    "externalId" VARCHAR(120) NOT NULL,
    "dealId" TEXT,
    "status" VARCHAR(20) NOT NULL,
    "commissionMinor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "reportedAt" TIMESTAMP(3) NOT NULL,
    "enteredById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AffiliateClick_dealId_createdAt_idx" ON "AffiliateClick"("dealId", "createdAt");

-- CreateIndex
CREATE INDEX "AffiliateClick_merchantId_createdAt_idx" ON "AffiliateClick"("merchantId", "createdAt");

-- CreateIndex
CREATE INDEX "AffiliateClick_actorHash_createdAt_idx" ON "AffiliateClick"("actorHash", "createdAt");

-- CreateIndex
CREATE INDEX "AffiliateClick_createdAt_idx" ON "AffiliateClick"("createdAt");

-- CreateIndex
CREATE INDEX "AffiliateTransaction_status_reportedAt_idx" ON "AffiliateTransaction"("status", "reportedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AffiliateTransaction_provider_externalId_key" ON "AffiliateTransaction"("provider", "externalId");

