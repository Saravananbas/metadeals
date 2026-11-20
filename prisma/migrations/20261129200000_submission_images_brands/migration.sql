CREATE TABLE "CommunityDealSubmissionImage" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "imageKey" VARCHAR(160) NOT NULL,
    "imageProvider" VARCHAR(10) NOT NULL,
    "imageMime" VARCHAR(40) NOT NULL,
    "imageBytes" INTEGER NOT NULL,
    "imageWidth" INTEGER NOT NULL,
    "imageHeight" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommunityDealSubmissionImage_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CommunityDealSubmissionImage_submissionId_position_key" ON "CommunityDealSubmissionImage"("submissionId", "position");
CREATE UNIQUE INDEX "Brand_slug_key" ON "Brand"("slug");
ALTER TABLE "CommunityDealSubmissionImage" ADD CONSTRAINT "CommunityDealSubmissionImage_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "CommunityDealSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
