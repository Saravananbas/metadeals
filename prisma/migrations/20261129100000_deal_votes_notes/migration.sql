-- AlterTable
ALTER TABLE "Deal" ADD COLUMN "editorNotes" VARCHAR(2800), ADD COLUMN "editorNotesBy" VARCHAR(80);

-- CreateTable
CREATE TABLE "DealVote" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "reason" VARCHAR(30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DealVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealNote" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "content" VARCHAR(500) NOT NULL,
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DealNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DealVote_dealId_value_idx" ON "DealVote"("dealId", "value");
CREATE UNIQUE INDEX "DealVote_customerId_dealId_key" ON "DealVote"("customerId", "dealId");
CREATE INDEX "DealNote_dealId_createdAt_idx" ON "DealNote"("dealId", "createdAt");
CREATE INDEX "DealNote_customerId_idx" ON "DealNote"("customerId");

ALTER TABLE "DealVote" ADD CONSTRAINT "DealVote_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealVote" ADD CONSTRAINT "DealVote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealNote" ADD CONSTRAINT "DealNote_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealNote" ADD CONSTRAINT "DealNote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "MemberStar" (
    "id" TEXT NOT NULL,
    "giverId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MemberStar_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MemberStar_receiverId_idx" ON "MemberStar"("receiverId");
CREATE UNIQUE INDEX "MemberStar_giverId_receiverId_key" ON "MemberStar"("giverId", "receiverId");
ALTER TABLE "MemberStar" ADD CONSTRAINT "MemberStar_giverId_fkey" FOREIGN KEY ("giverId") REFERENCES "ForumProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemberStar" ADD CONSTRAINT "MemberStar_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "ForumProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DealComment" ADD COLUMN "customerId" TEXT;
CREATE INDEX "DealComment_customerId_idx" ON "DealComment"("customerId");
ALTER TABLE "DealComment" ADD CONSTRAINT "DealComment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "DealCommentLike" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DealCommentLike_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DealCommentLike_customerId_idx" ON "DealCommentLike"("customerId");
CREATE UNIQUE INDEX "DealCommentLike_commentId_customerId_key" ON "DealCommentLike"("commentId", "customerId");
ALTER TABLE "DealCommentLike" ADD CONSTRAINT "DealCommentLike_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "DealComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealCommentLike" ADD CONSTRAINT "DealCommentLike_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DealComment" ADD COLUMN "imageKey" VARCHAR(160), ADD COLUMN "imageProvider" VARCHAR(10);

ALTER TABLE "DealComment" ADD COLUMN "parentId" TEXT;
CREATE INDEX "DealComment_parentId_idx" ON "DealComment"("parentId");
ALTER TABLE "DealComment" ADD CONSTRAINT "DealComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "DealComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
