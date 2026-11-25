-- CreateTable
CREATE TABLE "Bank" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "logoUrl" VARCHAR(2048),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealBankOffer" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "bankId" TEXT NOT NULL,
    "cardType" VARCHAR(12) NOT NULL,
    "discountType" VARCHAR(8) NOT NULL,
    "flatMinor" INTEGER,
    "percent" INTEGER,
    "capMinor" INTEGER,
    "minOrderMinor" INTEGER,
    "code" VARCHAR(40),
    "terms" VARCHAR(300),
    "validUntil" TIMESTAMP(3),
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealBankOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Bank_slug_key" ON "Bank"("slug");

-- CreateIndex
CREATE INDEX "Bank_active_sortOrder_idx" ON "Bank"("active", "sortOrder");

-- CreateIndex
CREATE INDEX "DealBankOffer_dealId_position_idx" ON "DealBankOffer"("dealId", "position");

-- CreateIndex
CREATE INDEX "DealBankOffer_bankId_idx" ON "DealBankOffer"("bankId");

-- AddForeignKey
ALTER TABLE "DealBankOffer" ADD CONSTRAINT "DealBankOffer_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealBankOffer" ADD CONSTRAINT "DealBankOffer_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "Bank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed: the banks offered in the Bank offers list (logos are uploaded on /admin/banks)
INSERT INTO "Bank" ("id", "slug", "name", "sortOrder", "updatedAt") VALUES
(gen_random_uuid()::text, 'hdfc-bank', 'HDFC Bank', 10, CURRENT_TIMESTAMP),
(gen_random_uuid()::text, 'icici-bank', 'ICICI Bank', 20, CURRENT_TIMESTAMP),
(gen_random_uuid()::text, 'sbi', 'State Bank of India (SBI)', 30, CURRENT_TIMESTAMP),
(gen_random_uuid()::text, 'axis-bank', 'Axis Bank', 40, CURRENT_TIMESTAMP),
(gen_random_uuid()::text, 'kotak-mahindra-bank', 'Kotak Mahindra Bank', 50, CURRENT_TIMESTAMP),
(gen_random_uuid()::text, 'idfc-first-bank', 'IDFC FIRST Bank', 60, CURRENT_TIMESTAMP),
(gen_random_uuid()::text, 'yes-bank', 'YES Bank', 70, CURRENT_TIMESTAMP),
(gen_random_uuid()::text, 'indusind-bank', 'IndusInd Bank', 80, CURRENT_TIMESTAMP),
(gen_random_uuid()::text, 'rbl-bank', 'RBL Bank', 90, CURRENT_TIMESTAMP),
(gen_random_uuid()::text, 'federal-bank', 'Federal Bank', 100, CURRENT_TIMESTAMP),
(gen_random_uuid()::text, 'au-small-finance-bank', 'AU Small Finance Bank', 110, CURRENT_TIMESTAMP),
(gen_random_uuid()::text, 'bank-of-baroda', 'Bank of Baroda', 120, CURRENT_TIMESTAMP),
(gen_random_uuid()::text, 'punjab-national-bank', 'Punjab National Bank', 130, CURRENT_TIMESTAMP),
(gen_random_uuid()::text, 'canara-bank', 'Canara Bank', 140, CURRENT_TIMESTAMP),
(gen_random_uuid()::text, 'union-bank-of-india', 'Union Bank of India', 150, CURRENT_TIMESTAMP),
(gen_random_uuid()::text, 'indian-bank', 'Indian Bank', 160, CURRENT_TIMESTAMP),
(gen_random_uuid()::text, 'bank-of-india', 'Bank of India', 170, CURRENT_TIMESTAMP),
(gen_random_uuid()::text, 'hsbc', 'HSBC', 180, CURRENT_TIMESTAMP),
(gen_random_uuid()::text, 'standard-chartered', 'Standard Chartered', 190, CURRENT_TIMESTAMP),
(gen_random_uuid()::text, 'american-express', 'American Express', 200, CURRENT_TIMESTAMP),
(gen_random_uuid()::text, 'citibank', 'Citibank', 210, CURRENT_TIMESTAMP),
(gen_random_uuid()::text, 'idbi-bank', 'IDBI Bank', 220, CURRENT_TIMESTAMP),
(gen_random_uuid()::text, 'south-indian-bank', 'South Indian Bank', 230, CURRENT_TIMESTAMP),
(gen_random_uuid()::text, 'karur-vysya-bank', 'Karur Vysya Bank', 240, CURRENT_TIMESTAMP),
(gen_random_uuid()::text, 'bandhan-bank', 'Bandhan Bank', 250, CURRENT_TIMESTAMP),
(gen_random_uuid()::text, 'onecard', 'OneCard', 260, CURRENT_TIMESTAMP),
(gen_random_uuid()::text, 'slice', 'Slice', 270, CURRENT_TIMESTAMP),
(gen_random_uuid()::text, 'amazon-pay-icici', 'Amazon Pay ICICI', 280, CURRENT_TIMESTAMP),
(gen_random_uuid()::text, 'flipkart-axis-bank', 'Flipkart Axis Bank', 290, CURRENT_TIMESTAMP);
