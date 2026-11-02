BEGIN;
-- CreateEnum
CREATE TYPE "DealStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'EXPIRED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Merchant" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "websiteUrl" VARCHAR(2048) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Media" (
    "id" TEXT NOT NULL,
    "storageKey" VARCHAR(160) NOT NULL,
    "provider" VARCHAR(10) NOT NULL,
    "mimeType" VARCHAR(40) NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "alt" VARCHAR(240) NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "brand" VARCHAR(100) NOT NULL,
    "description" VARCHAR(2000) NOT NULL,
    "categoryId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "mrpMinor" INTEGER NOT NULL,
    "priceMinor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "rating" DOUBLE PRECISION,
    "reviewCount" INTEGER,
    "ratingSource" VARCHAR(200),
    "productUrl" VARCHAR(2048) NOT NULL,
    "affiliateUrl" VARCHAR(2048),
    "status" "DealStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "trending" BOOLEAN NOT NULL DEFAULT false,
    "everPublished" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOption" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "priceMinor" INTEGER NOT NULL,
    "productUrl" VARCHAR(2048) NOT NULL,
    "affiliateUrl" VARCHAR(2048),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_slug_key" ON "Merchant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Media_storageKey_key" ON "Media"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "Deal_slug_key" ON "Deal"("slug");

-- CreateIndex
CREATE INDEX "Deal_status_publishedAt_id_idx" ON "Deal"("status", "publishedAt", "id");

-- CreateIndex
CREATE INDEX "Deal_categoryId_status_publishedAt_idx" ON "Deal"("categoryId", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "Deal_merchantId_status_publishedAt_idx" ON "Deal"("merchantId", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "Deal_expiresAt_idx" ON "Deal"("expiresAt");

-- CreateIndex
CREATE INDEX "Deal_featured_status_publishedAt_idx" ON "Deal"("featured", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "Deal_trending_status_publishedAt_idx" ON "Deal"("trending", "status", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOption_dealId_merchantId_key" ON "PurchaseOption"("dealId", "merchantId");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOption" ADD CONSTRAINT "PurchaseOption_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOption" ADD CONSTRAINT "PurchaseOption_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Deal" ADD CONSTRAINT "Deal_price_check" CHECK ("mrpMinor" > 0 AND "priceMinor" >= 0 AND "priceMinor" <= "mrpMinor" AND "currency" = 'INR');
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_rating_check" CHECK (("rating" IS NULL OR ("rating" >= 0 AND "rating" <= 5)) AND ("reviewCount" IS NULL OR "reviewCount" >= 0) AND (("rating" IS NULL AND "reviewCount" IS NULL) OR length("ratingSource") > 0));
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_dates_check" CHECK (("expiresAt" IS NULL OR "startsAt" IS NULL OR "expiresAt" > "startsAt") AND ("expiresAt" IS NULL OR "publishedAt" IS NULL OR "expiresAt" > "publishedAt"));
ALTER TABLE "PurchaseOption" ADD CONSTRAINT "PurchaseOption_price_check" CHECK ("priceMinor" >= 0);
ALTER TABLE "Media" ADD CONSTRAINT "Media_size_check" CHECK ("byteSize" > 0 AND "width" > 0 AND "height" > 0);
ALTER TABLE "Category" ADD CONSTRAINT "Category_parent_check" CHECK ("parentId" IS NULL OR "parentId" <> "id");

COMMIT;
