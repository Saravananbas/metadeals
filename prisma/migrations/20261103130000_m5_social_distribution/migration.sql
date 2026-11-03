-- CreateEnum
CREATE TYPE "DistributionPlatform" AS ENUM ('TELEGRAM', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "DistributionDestination" (
    "id" TEXT NOT NULL,
    "platform" "DistributionPlatform" NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "destinationId" VARCHAR(120) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DistributionDestination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DistributionPost" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "platform" "DistributionPlatform" NOT NULL,
    "status" "PostStatus" NOT NULL DEFAULT 'QUEUED',
    "messageContent" TEXT NOT NULL,
    "externalMessageId" VARCHAR(120),
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DistributionPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DistributionDestination_platform_destinationId_key" ON "DistributionDestination"("platform", "destinationId");

-- CreateIndex
CREATE INDEX "DistributionPost_status_createdAt_idx" ON "DistributionPost"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DistributionPost_dealId_destinationId_key" ON "DistributionPost"("dealId", "destinationId");

-- AddForeignKey
ALTER TABLE "DistributionPost" ADD CONSTRAINT "DistributionPost_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "DistributionDestination"("id") ON DELETE CASCADE ON UPDATE CASCADE;
