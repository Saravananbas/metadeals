-- CreateTable
CREATE TABLE "MerchantBankOffer" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "bankId" TEXT NOT NULL,
    "cardType" VARCHAR(12) NOT NULL,
    "discountType" VARCHAR(8) NOT NULL,
    "flatMinor" INTEGER,
    "percent" INTEGER,
    "capMinor" INTEGER,
    "minOrderMinor" INTEGER,
    "code" VARCHAR(40),
    "terms" VARCHAR(300),
    "startsOn" VARCHAR(10) NOT NULL,
    "endsOn" VARCHAR(10),
    "weekdays" VARCHAR(20) NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantBankOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MerchantBankOffer_merchantId_active_idx" ON "MerchantBankOffer"("merchantId", "active");

-- CreateIndex
CREATE INDEX "MerchantBankOffer_bankId_idx" ON "MerchantBankOffer"("bankId");

-- AddForeignKey
ALTER TABLE "MerchantBankOffer" ADD CONSTRAINT "MerchantBankOffer_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantBankOffer" ADD CONSTRAINT "MerchantBankOffer_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "Bank"("id") ON DELETE CASCADE ON UPDATE CASCADE;
