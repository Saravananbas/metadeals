-- CreateEnum
CREATE TYPE "ForumPostType" AS ENUM ('DEAL', 'DISCUSSION', 'QUESTION');

-- CreateEnum
CREATE TYPE "ForumContentStatus" AS ENUM ('PENDING_REVIEW', 'PUBLISHED', 'REMOVED', 'DELETED');

-- CreateEnum
CREATE TYPE "ForumMemberStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ForumReportTarget" AS ENUM ('POST', 'COMMENT', 'PROFILE');

-- CreateEnum
CREATE TYPE "ForumReportCategory" AS ENUM ('SPAM', 'SCAM', 'HARASSMENT', 'HATE', 'ILLEGAL', 'PRIVACY', 'IMPERSONATION', 'OFF_TOPIC', 'OTHER');

-- CreateEnum
CREATE TYPE "ForumReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED', 'ESCALATED');

-- CreateTable
CREATE TABLE "ForumCommunity" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(40) NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "description" VARCHAR(300) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "requiresReview" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForumCommunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForumProfile" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "handle" VARCHAR(30) NOT NULL,
    "bio" VARCHAR(280),
    "status" "ForumMemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "suspendedUntil" TIMESTAMP(3),
    "suspensionReason" VARCHAR(300),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForumProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForumPost" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "communityId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "type" "ForumPostType" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "url" VARCHAR(2048),
    "urlHash" CHAR(64),
    "merchantName" VARCHAR(100),
    "priceMinor" INTEGER,
    "mrpMinor" INTEGER,
    "couponCode" VARCHAR(50),
    "contentHash" CHAR(64) NOT NULL,
    "status" "ForumContentStatus" NOT NULL DEFAULT 'PUBLISHED',
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "score" INTEGER NOT NULL DEFAULT 0,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "removalReason" VARCHAR(300),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "editedAt" TIMESTAMP(3),

    CONSTRAINT "ForumPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForumComment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "parentId" TEXT,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "body" TEXT NOT NULL,
    "status" "ForumContentStatus" NOT NULL DEFAULT 'PUBLISHED',
    "score" INTEGER NOT NULL DEFAULT 0,
    "removalReason" VARCHAR(300),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "editedAt" TIMESTAMP(3),

    CONSTRAINT "ForumComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForumPostVote" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForumPostVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForumCommentVote" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForumCommentVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForumSave" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForumSave_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForumFollow" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForumFollow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForumReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "targetType" "ForumReportTarget" NOT NULL,
    "postId" TEXT,
    "commentId" TEXT,
    "targetProfileId" TEXT,
    "category" "ForumReportCategory" NOT NULL,
    "details" VARCHAR(500),
    "status" "ForumReportStatus" NOT NULL DEFAULT 'OPEN',
    "version" INTEGER NOT NULL DEFAULT 1,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolution" VARCHAR(300),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForumReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForumModerationAction" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" VARCHAR(40) NOT NULL,
    "targetType" VARCHAR(12) NOT NULL,
    "postId" TEXT,
    "commentId" TEXT,
    "profileId" TEXT,
    "reason" VARCHAR(500) NOT NULL,
    "correlationId" VARCHAR(36) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForumModerationAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ForumCommunity_slug_key" ON "ForumCommunity"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ForumProfile_customerId_key" ON "ForumProfile"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "ForumProfile_handle_key" ON "ForumProfile"("handle");

-- CreateIndex
CREATE UNIQUE INDEX "ForumPost_slug_key" ON "ForumPost"("slug");

-- CreateIndex
CREATE INDEX "ForumPost_status_publishedAt_id_idx" ON "ForumPost"("status", "publishedAt", "id");

-- CreateIndex
CREATE INDEX "ForumPost_communityId_status_publishedAt_idx" ON "ForumPost"("communityId", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "ForumPost_status_score_publishedAt_idx" ON "ForumPost"("status", "score", "publishedAt");

-- CreateIndex
CREATE INDEX "ForumPost_authorId_createdAt_idx" ON "ForumPost"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX "ForumPost_urlHash_idx" ON "ForumPost"("urlHash");

-- CreateIndex
CREATE INDEX "ForumPost_authorId_contentHash_idx" ON "ForumPost"("authorId", "contentHash");

-- CreateIndex
CREATE INDEX "ForumComment_postId_parentId_createdAt_idx" ON "ForumComment"("postId", "parentId", "createdAt");

-- CreateIndex
CREATE INDEX "ForumComment_parentId_createdAt_idx" ON "ForumComment"("parentId", "createdAt");

-- CreateIndex
CREATE INDEX "ForumComment_authorId_createdAt_idx" ON "ForumComment"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX "ForumPostVote_profileId_idx" ON "ForumPostVote"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "ForumPostVote_postId_profileId_key" ON "ForumPostVote"("postId", "profileId");

-- CreateIndex
CREATE INDEX "ForumCommentVote_profileId_idx" ON "ForumCommentVote"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "ForumCommentVote_commentId_profileId_key" ON "ForumCommentVote"("commentId", "profileId");

-- CreateIndex
CREATE INDEX "ForumSave_profileId_createdAt_idx" ON "ForumSave"("profileId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ForumSave_postId_profileId_key" ON "ForumSave"("postId", "profileId");

-- CreateIndex
CREATE INDEX "ForumFollow_profileId_idx" ON "ForumFollow"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "ForumFollow_communityId_profileId_key" ON "ForumFollow"("communityId", "profileId");

-- CreateIndex
CREATE INDEX "ForumReport_status_createdAt_idx" ON "ForumReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ForumReport_postId_idx" ON "ForumReport"("postId");

-- CreateIndex
CREATE INDEX "ForumReport_commentId_idx" ON "ForumReport"("commentId");

-- CreateIndex
CREATE UNIQUE INDEX "ForumReport_reporterId_postId_key" ON "ForumReport"("reporterId", "postId");

-- CreateIndex
CREATE UNIQUE INDEX "ForumReport_reporterId_commentId_key" ON "ForumReport"("reporterId", "commentId");

-- CreateIndex
CREATE UNIQUE INDEX "ForumReport_reporterId_targetProfileId_key" ON "ForumReport"("reporterId", "targetProfileId");

-- CreateIndex
CREATE INDEX "ForumModerationAction_createdAt_idx" ON "ForumModerationAction"("createdAt");

-- CreateIndex
CREATE INDEX "ForumModerationAction_postId_idx" ON "ForumModerationAction"("postId");

-- CreateIndex
CREATE INDEX "ForumModerationAction_profileId_idx" ON "ForumModerationAction"("profileId");

-- AddForeignKey
ALTER TABLE "ForumProfile" ADD CONSTRAINT "ForumProfile_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumPost" ADD CONSTRAINT "ForumPost_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "ForumCommunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumPost" ADD CONSTRAINT "ForumPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "ForumProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumComment" ADD CONSTRAINT "ForumComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ForumPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumComment" ADD CONSTRAINT "ForumComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "ForumProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumComment" ADD CONSTRAINT "ForumComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ForumComment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumPostVote" ADD CONSTRAINT "ForumPostVote_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ForumPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumPostVote" ADD CONSTRAINT "ForumPostVote_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ForumProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumCommentVote" ADD CONSTRAINT "ForumCommentVote_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "ForumComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumCommentVote" ADD CONSTRAINT "ForumCommentVote_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ForumProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumSave" ADD CONSTRAINT "ForumSave_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ForumPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumSave" ADD CONSTRAINT "ForumSave_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ForumProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumFollow" ADD CONSTRAINT "ForumFollow_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "ForumCommunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumFollow" ADD CONSTRAINT "ForumFollow_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ForumProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumReport" ADD CONSTRAINT "ForumReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "ForumProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumReport" ADD CONSTRAINT "ForumReport_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ForumPost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumReport" ADD CONSTRAINT "ForumReport_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "ForumComment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumReport" ADD CONSTRAINT "ForumReport_targetProfileId_fkey" FOREIGN KEY ("targetProfileId") REFERENCES "ForumProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumReport" ADD CONSTRAINT "ForumReport_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumModerationAction" ADD CONSTRAINT "ForumModerationAction_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
