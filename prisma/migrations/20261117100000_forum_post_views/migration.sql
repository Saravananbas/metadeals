-- AlterTable (additive)
ALTER TABLE "ForumPost" ADD COLUMN "viewCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "ForumPost_status_commentCount_publishedAt_idx" ON "ForumPost"("status", "commentCount", "publishedAt");
CREATE INDEX "ForumPost_status_viewCount_publishedAt_idx" ON "ForumPost"("status", "viewCount", "publishedAt");
