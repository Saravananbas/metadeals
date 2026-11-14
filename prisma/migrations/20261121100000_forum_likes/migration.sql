-- AlterTable (additive)
ALTER TABLE "ForumPost" ADD COLUMN "likeCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ForumComment" ADD COLUMN "likeCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "bodyHtml" TEXT;

-- CreateTable
CREATE TABLE "ForumPostLike" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ForumPostLike_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ForumCommentLike" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ForumCommentLike_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ForumPostLike_postId_profileId_key" ON "ForumPostLike"("postId", "profileId");
CREATE INDEX "ForumPostLike_profileId_idx" ON "ForumPostLike"("profileId");
CREATE UNIQUE INDEX "ForumCommentLike_commentId_profileId_key" ON "ForumCommentLike"("commentId", "profileId");
CREATE INDEX "ForumCommentLike_profileId_idx" ON "ForumCommentLike"("profileId");
CREATE INDEX "ForumComment_postId_likeCount_idx" ON "ForumComment"("postId", "likeCount");

-- AddForeignKey
ALTER TABLE "ForumPostLike" ADD CONSTRAINT "ForumPostLike_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ForumPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ForumPostLike" ADD CONSTRAINT "ForumPostLike_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ForumProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ForumCommentLike" ADD CONSTRAINT "ForumCommentLike_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "ForumComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ForumCommentLike" ADD CONSTRAINT "ForumCommentLike_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ForumProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
