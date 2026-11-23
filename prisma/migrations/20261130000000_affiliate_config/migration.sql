-- AlterTable
ALTER TABLE "AffiliateClick" ADD COLUMN "provider" VARCHAR(24);

-- CreateTable
CREATE TABLE "MerchantAffiliateConfig" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "mode" VARCHAR(12) NOT NULL,
    "provider" VARCHAR(24) NOT NULL,
    "publicId" VARCHAR(120),
    "linkTemplate" VARCHAR(1000),
    "credentialsEncrypted" TEXT,
    "apiEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantAffiliateConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MerchantAffiliateConfig_merchantId_key" ON "MerchantAffiliateConfig"("merchantId");

-- AddForeignKey
ALTER TABLE "MerchantAffiliateConfig" ADD CONSTRAINT "MerchantAffiliateConfig_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
