-- CreateTable (additive)
CREATE TABLE "ForumNotification" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" VARCHAR(30) NOT NULL,
    "postId" TEXT NOT NULL,
    "postSlug" VARCHAR(120) NOT NULL,
    "postTitle" VARCHAR(200) NOT NULL,
    "commentId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ForumNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ForumNotification_recipientId_readAt_createdAt_idx" ON "ForumNotification"("recipientId", "readAt", "createdAt");
CREATE INDEX "ForumNotification_createdAt_idx" ON "ForumNotification"("createdAt");

-- AddForeignKey
ALTER TABLE "ForumNotification" ADD CONSTRAINT "ForumNotification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "ForumProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ForumNotification" ADD CONSTRAINT "ForumNotification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "ForumProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
