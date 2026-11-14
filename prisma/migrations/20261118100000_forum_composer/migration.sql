-- AlterTable (additive)
ALTER TABLE "ForumPost" ADD COLUMN "bodyHtml" TEXT,
ADD COLUMN "notifyReplies" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ForumPostImage" (
    "id" TEXT NOT NULL,
    "postId" TEXT,
    "profileId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "storageKey" VARCHAR(160) NOT NULL,
    "provider" VARCHAR(10) NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "bytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ForumPostImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForumPostDraft" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ForumPostDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ForumPostImage_postId_position_idx" ON "ForumPostImage"("postId", "position");
CREATE INDEX "ForumPostImage_profileId_postId_createdAt_idx" ON "ForumPostImage"("profileId", "postId", "createdAt");
CREATE UNIQUE INDEX "ForumPostDraft_profileId_key" ON "ForumPostDraft"("profileId");

-- AddForeignKey
ALTER TABLE "ForumPostImage" ADD CONSTRAINT "ForumPostImage_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ForumPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ForumPostImage" ADD CONSTRAINT "ForumPostImage_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ForumProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ForumPostDraft" ADD CONSTRAINT "ForumPostDraft_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ForumProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
