-- CreateEnum
DO $migration$
BEGIN
    CREATE TYPE "SourceHealthState" AS ENUM ('HEALTHY', 'DEGRADED', 'SUSPENDED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$migration$;

-- CreateEnum
DO $migration$
BEGIN
    CREATE TYPE "PublicationAuthStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'CLAIMED', 'PUBLISHING', 'PUBLISHED', 'REJECTED', 'EXPIRED', 'RECOVERY_REQUIRED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$migration$;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "image" VARCHAR(1024);
ALTER TABLE "Customer" ALTER COLUMN "emailVerifiedAt" DROP NOT NULL;

-- AlterTable
ALTER TABLE "CustomerIdentity" ADD COLUMN IF NOT EXISTS "avatarUrl" VARCHAR(1024),
ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS "email" TEXT,
ADD COLUMN IF NOT EXISTS "name" TEXT,
ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "CustomerIdentity" SET "updatedAt" = COALESCE("updatedAt", "createdAt", CURRENT_TIMESTAMP) WHERE "updatedAt" IS NULL;
ALTER TABLE "CustomerIdentity" ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE "CustomerIdentity" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "couponCode" VARCHAR(50),
ADD COLUMN IF NOT EXISTS "shareCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "viewCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProductExtractionLog" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT,
    "retailer" VARCHAR(60) NOT NULL,
    "originalUrl" VARCHAR(2048) NOT NULL,
    "extractionStatus" VARCHAR(40) NOT NULL,
    "fieldsSummary" JSONB,
    "sourceMethod" VARCHAR(60) NOT NULL,
    "errorCode" VARCHAR(60),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductExtractionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProductMaster" (
    "id" TEXT NOT NULL,
    "canonicalTitle" VARCHAR(500) NOT NULL,
    "brand" VARCHAR(150) NOT NULL,
    "categorySlug" VARCHAR(100),
    "gtin" VARCHAR(50),
    "mpn" VARCHAR(100),
    "modelNumber" VARCHAR(100),
    "description" TEXT,
    "defaultImageId" VARCHAR(128),
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProductVariant" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantKey" VARCHAR(150) NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "color" VARCHAR(100),
    "size" VARCHAR(50),
    "storageCapacity" VARCHAR(50),
    "condition" VARCHAR(50) NOT NULL DEFAULT 'NEW',
    "asin" VARCHAR(20),
    "fsn" VARCHAR(30),
    "sku" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProductOffer" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "merchantSlug" VARCHAR(60) NOT NULL,
    "sellerName" VARCHAR(150),
    "sellerRating" DOUBLE PRECISION,
    "retailerUrl" VARCHAR(2048) NOT NULL,
    "inStock" BOOLEAN NOT NULL DEFAULT true,
    "currentPricePaise" INTEGER NOT NULL,
    "mrpPaise" INTEGER NOT NULL,
    "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PriceObservationRecord" (
    "id" TEXT NOT NULL,
    "variantId" TEXT,
    "merchantSlug" VARCHAR(60) NOT NULL,
    "sellerName" VARCHAR(150),
    "url" VARCHAR(2048) NOT NULL,
    "mrpPaise" INTEGER NOT NULL,
    "sellingPricePaise" INTEGER NOT NULL,
    "couponPricePaise" INTEGER,
    "bankOfferPaise" INTEGER,
    "deliveryFeePaise" INTEGER NOT NULL DEFAULT 0,
    "effectivePricePaise" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "extractionMethod" VARCHAR(60) NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceObservationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SourceHealthRecord" (
    "id" TEXT NOT NULL,
    "connectorCode" VARCHAR(60) NOT NULL,
    "state" "SourceHealthState" NOT NULL DEFAULT 'HEALTHY',
    "totalRequests" INTEGER NOT NULL DEFAULT 0,
    "successfulRequests" INTEGER NOT NULL DEFAULT 0,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "lastSuccessAt" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "lastFailureReason" VARCHAR(500),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceHealthRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PublicationAuthorization" (
    "id" TEXT NOT NULL,
    "candidateId" VARCHAR(128) NOT NULL,
    "authorizedByAdmin" VARCHAR(100),
    "approvalToken" VARCHAR(128) NOT NULL,
    "status" "PublicationAuthStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "isPriceErrorSuspected" BOOLEAN NOT NULL DEFAULT false,
    "confidenceScore" DOUBLE PRECISION NOT NULL,
    "attractivenessScore" DOUBLE PRECISION NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicationAuthorization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ShadowCandidate" (
    "id" TEXT NOT NULL,
    "competitorSource" VARCHAR(100) NOT NULL,
    "sourceUrl" VARCHAR(2048) NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "pricePaise" INTEGER NOT NULL,
    "mrpPaise" INTEGER NOT NULL,
    "brand" VARCHAR(150),
    "matchedProductId" VARCHAR(128),
    "matchedVariantId" VARCHAR(128),
    "dealScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShadowCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "DealLifecycleEvent" (
    "id" TEXT NOT NULL,
    "dealId" VARCHAR(128) NOT NULL,
    "eventType" VARCHAR(60) NOT NULL,
    "previousState" JSONB,
    "newState" JSONB,
    "triggeredBy" VARCHAR(100) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealLifecycleEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProductExtractionLog_retailer_createdAt_idx" ON "ProductExtractionLog"("retailer", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProductExtractionLog_adminUserId_createdAt_idx" ON "ProductExtractionLog"("adminUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ProductMaster_gtin_key" ON "ProductMaster"("gtin");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProductMaster_brand_canonicalTitle_idx" ON "ProductMaster"("brand", "canonicalTitle");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProductMaster_categorySlug_idx" ON "ProductMaster"("categorySlug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProductMaster_gtin_idx" ON "ProductMaster"("gtin");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProductVariant_asin_idx" ON "ProductVariant"("asin");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProductVariant_fsn_idx" ON "ProductVariant"("fsn");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ProductVariant_productId_variantKey_key" ON "ProductVariant"("productId", "variantKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProductOffer_merchantSlug_inStock_idx" ON "ProductOffer"("merchantSlug", "inStock");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProductOffer_productId_variantId_idx" ON "ProductOffer"("productId", "variantId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PriceObservationRecord_variantId_observedAt_idx" ON "PriceObservationRecord"("variantId", "observedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PriceObservationRecord_merchantSlug_observedAt_idx" ON "PriceObservationRecord"("merchantSlug", "observedAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SourceHealthRecord_connectorCode_key" ON "SourceHealthRecord"("connectorCode");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SourceHealthRecord_state_idx" ON "SourceHealthRecord"("state");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PublicationAuthorization_candidateId_key" ON "PublicationAuthorization"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PublicationAuthorization_approvalToken_key" ON "PublicationAuthorization"("approvalToken");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PublicationAuthorization_status_idx" ON "PublicationAuthorization"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PublicationAuthorization_expiresAt_idx" ON "PublicationAuthorization"("expiresAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ShadowCandidate_competitorSource_discoveredAt_idx" ON "ShadowCandidate"("competitorSource", "discoveredAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ShadowCandidate_matchedProductId_idx" ON "ShadowCandidate"("matchedProductId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DealLifecycleEvent_dealId_recordedAt_idx" ON "DealLifecycleEvent"("dealId", "recordedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DealLifecycleEvent_eventType_recordedAt_idx" ON "DealLifecycleEvent"("eventType", "recordedAt");

-- AddForeignKey
DO $migration$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductVariant_productId_fkey' AND conrelid = '"ProductVariant"'::regclass) THEN
        ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ProductMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END
$migration$;

-- AddForeignKey
DO $migration$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductOffer_productId_fkey' AND conrelid = '"ProductOffer"'::regclass) THEN
        ALTER TABLE "ProductOffer" ADD CONSTRAINT "ProductOffer_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ProductMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END
$migration$;

-- AddForeignKey
DO $migration$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductOffer_variantId_fkey' AND conrelid = '"ProductOffer"'::regclass) THEN
        ALTER TABLE "ProductOffer" ADD CONSTRAINT "ProductOffer_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END
$migration$;

-- AddForeignKey
DO $migration$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PriceObservationRecord_variantId_fkey' AND conrelid = '"PriceObservationRecord"'::regclass) THEN
        ALTER TABLE "PriceObservationRecord" ADD CONSTRAINT "PriceObservationRecord_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END
$migration$;

