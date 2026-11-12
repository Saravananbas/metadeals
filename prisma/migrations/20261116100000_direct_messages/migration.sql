-- CreateEnum
CREATE TYPE "DmThreadStatus" AS ENUM ('REQUESTED', 'ACCEPTED', 'DECLINED');

-- CreateTable
CREATE TABLE "DmThread" (
    "id" TEXT NOT NULL,
    "profileLowId" TEXT NOT NULL,
    "profileHighId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "status" "DmThreadStatus" NOT NULL DEFAULT 'REQUESTED',
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lowReadAt" TIMESTAMP(3),
    "highReadAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DmThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DmMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DmMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DmBlock" (
    "id" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DmBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DmReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reportedProfileId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "category" "ForumReportCategory" NOT NULL,
    "details" VARCHAR(500),
    "snapshot" VARCHAR(2000) NOT NULL,
    "status" "ForumReportStatus" NOT NULL DEFAULT 'OPEN',
    "version" INTEGER NOT NULL DEFAULT 1,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolution" VARCHAR(300),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DmReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DmThread_profileLowId_lastMessageAt_idx" ON "DmThread"("profileLowId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "DmThread_profileHighId_lastMessageAt_idx" ON "DmThread"("profileHighId", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "DmThread_profileLowId_profileHighId_key" ON "DmThread"("profileLowId", "profileHighId");

-- CreateIndex
CREATE INDEX "DmMessage_threadId_createdAt_idx" ON "DmMessage"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "DmBlock_blockedId_idx" ON "DmBlock"("blockedId");

-- CreateIndex
CREATE UNIQUE INDEX "DmBlock_blockerId_blockedId_key" ON "DmBlock"("blockerId", "blockedId");

-- CreateIndex
CREATE INDEX "DmReport_status_createdAt_idx" ON "DmReport"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DmReport_reporterId_messageId_key" ON "DmReport"("reporterId", "messageId");

-- AddForeignKey
ALTER TABLE "DmThread" ADD CONSTRAINT "DmThread_profileLowId_fkey" FOREIGN KEY ("profileLowId") REFERENCES "ForumProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DmThread" ADD CONSTRAINT "DmThread_profileHighId_fkey" FOREIGN KEY ("profileHighId") REFERENCES "ForumProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DmMessage" ADD CONSTRAINT "DmMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "DmThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DmMessage" ADD CONSTRAINT "DmMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "ForumProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DmBlock" ADD CONSTRAINT "DmBlock_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "ForumProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DmBlock" ADD CONSTRAINT "DmBlock_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "ForumProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
