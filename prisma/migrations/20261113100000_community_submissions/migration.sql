-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "dateOfBirth" DATE,
ADD COLUMN     "location" VARCHAR(100),
ADD COLUMN     "sex" VARCHAR(20);

-- CreateTable
CREATE TABLE "CommunityDealSubmission" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "title" VARCHAR(200) NOT NULL,
    "brand" VARCHAR(100),
    "description" VARCHAR(2000) NOT NULL,
    "productUrl" VARCHAR(2048) NOT NULL,
    "urlHash" CHAR(64) NOT NULL,
    "merchantName" VARCHAR(100),
    "categoryHint" VARCHAR(100),
    "priceMinor" INTEGER NOT NULL,
    "mrpMinor" INTEGER,
    "couponCode" VARCHAR(50),
    "imageKey" VARCHAR(160) NOT NULL,
    "imageProvider" VARCHAR(10) NOT NULL,
    "imageMime" VARCHAR(40) NOT NULL,
    "imageBytes" INTEGER NOT NULL,
    "imageWidth" INTEGER NOT NULL,
    "imageHeight" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "resubmissions" INTEGER NOT NULL DEFAULT 0,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" VARCHAR(500),
    "dealId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityDealSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommunityDealSubmission_dealId_key" ON "CommunityDealSubmission"("dealId");

-- CreateIndex
CREATE INDEX "CommunityDealSubmission_status_submittedAt_idx" ON "CommunityDealSubmission"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "CommunityDealSubmission_customerId_status_idx" ON "CommunityDealSubmission"("customerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityDealSubmission_customerId_urlHash_key" ON "CommunityDealSubmission"("customerId", "urlHash");

-- AddForeignKey
ALTER TABLE "CommunityDealSubmission" ADD CONSTRAINT "CommunityDealSubmission_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityDealSubmission" ADD CONSTRAINT "CommunityDealSubmission_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityDealSubmission" ADD CONSTRAINT "CommunityDealSubmission_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
