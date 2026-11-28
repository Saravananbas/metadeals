-- SEO deal addresses. Additive only.
-- AlterTable
ALTER TABLE "Deal" ADD COLUMN "publicId" VARCHAR(12),
ADD COLUMN "canonicalPath" VARCHAR(300);

-- CreateTable
CREATE TABLE "DealUrlHistory" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "path" VARCHAR(300) NOT NULL,
    "reason" VARCHAR(20) NOT NULL,
    "redirectStatus" INTEGER NOT NULL DEFAULT 301,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealUrlHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DealUrlHistory_path_key" ON "DealUrlHistory"("path");

-- CreateIndex
CREATE INDEX "DealUrlHistory_dealId_idx" ON "DealUrlHistory"("dealId");

-- CreateIndex
CREATE UNIQUE INDEX "Deal_publicId_key" ON "Deal"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "Deal_canonicalPath_key" ON "Deal"("canonicalPath");
