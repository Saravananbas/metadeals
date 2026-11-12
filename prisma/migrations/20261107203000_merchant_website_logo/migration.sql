-- AlterTable
ALTER TABLE "MerchantWebsiteDirectory" ADD COLUMN "logoMediaId" TEXT;
ALTER TABLE "MerchantWebsiteDirectory" ADD COLUMN "logoUrl" VARCHAR(2048);

-- CreateIndex
CREATE INDEX "MerchantWebsiteDirectory_logoMediaId_idx" ON "MerchantWebsiteDirectory"("logoMediaId");

