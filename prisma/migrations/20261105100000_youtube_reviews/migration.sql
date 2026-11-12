-- CreateTable
CREATE TABLE "DealVideoReview" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "videoId" VARCHAR(50) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "channelTitle" VARCHAR(150) NOT NULL,
    "channelId" VARCHAR(100),
    "thumbnailUrl" VARCHAR(1000) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "duration" VARCHAR(30),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "likeCount" INTEGER,
    "language" VARCHAR(50) NOT NULL DEFAULT 'English',
    "relevanceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rankingPosition" INTEGER NOT NULL DEFAULT 1,
    "isEmbeddable" BOOLEAN NOT NULL DEFAULT true,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastFetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealVideoReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DealVideoReview_dealId_videoId_key" ON "DealVideoReview"("dealId", "videoId");

-- CreateIndex
CREATE INDEX "DealVideoReview_dealId_isActive_rankingPosition_idx" ON "DealVideoReview"("dealId", "isActive", "rankingPosition");

-- CreateIndex
CREATE INDEX "DealVideoReview_dealId_language_idx" ON "DealVideoReview"("dealId", "language");

-- AddForeignKey
ALTER TABLE "DealVideoReview" ADD CONSTRAINT "DealVideoReview_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

