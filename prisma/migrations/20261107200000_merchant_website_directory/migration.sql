-- CreateEnum
CREATE TYPE "MerchantDirectoryStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'UNDER_REVIEW');

-- CreateEnum
CREATE TYPE "MerchantDirectoryVerification" AS ENUM ('VERIFIED', 'UNVERIFIED', 'NEEDS_REVIEW');

-- CreateTable
CREATE TABLE "MerchantWebsiteDirectory" (
    "id" TEXT NOT NULL,
    "merchantCode" VARCHAR(50),
    "name" VARCHAR(150) NOT NULL,
    "websiteUrl" VARCHAR(2048) NOT NULL,
    "domain" VARCHAR(150) NOT NULL,
    "category" VARCHAR(100) NOT NULL DEFAULT 'UNCLASSIFIED',
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "productFocus" VARCHAR(255),
    "businessModel" VARCHAR(100),
    "description" VARCHAR(2000),
    "country" VARCHAR(50) NOT NULL DEFAULT 'India',
    "status" "MerchantDirectoryStatus" NOT NULL DEFAULT 'ACTIVE',
    "verificationStatus" "MerchantDirectoryVerification" NOT NULL DEFAULT 'UNVERIFIED',
    "source" VARCHAR(100) NOT NULL DEFAULT 'EXCEL_IMPORT',
    "notes" VARCHAR(2000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantWebsiteDirectory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MerchantWebsiteDirectory_domain_key" ON "MerchantWebsiteDirectory"("domain");

-- CreateIndex
CREATE INDEX "MerchantWebsiteDirectory_name_idx" ON "MerchantWebsiteDirectory"("name");

-- CreateIndex
CREATE INDEX "MerchantWebsiteDirectory_category_idx" ON "MerchantWebsiteDirectory"("category");

-- CreateIndex
CREATE INDEX "MerchantWebsiteDirectory_status_idx" ON "MerchantWebsiteDirectory"("status");

-- CreateIndex
CREATE INDEX "MerchantWebsiteDirectory_verificationStatus_idx" ON "MerchantWebsiteDirectory"("verificationStatus");

-- CreateIndex
CREATE INDEX "MerchantWebsiteDirectory_createdAt_idx" ON "MerchantWebsiteDirectory"("createdAt");

