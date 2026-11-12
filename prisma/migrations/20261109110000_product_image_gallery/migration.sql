CREATE TABLE "DealGalleryImage" (
  "id" TEXT NOT NULL,
  "dealId" TEXT NOT NULL,
  "mediaId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DealGalleryImage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DealGalleryImage_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DealGalleryImage_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DealGalleryImage_dealId_position_key" ON "DealGalleryImage"("dealId", "position");
CREATE INDEX "DealGalleryImage_mediaId_idx" ON "DealGalleryImage"("mediaId");
