-- CreateTable (additive)
CREATE TABLE "ForumAnnouncement" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "bodyHtml" TEXT,
    "status" VARCHAR(12) NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "publishedById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ForumAnnouncement_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "StaffPermissionGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permission" VARCHAR(60) NOT NULL,
    "grantedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StaffPermissionGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ForumAnnouncement_slug_key" ON "ForumAnnouncement"("slug");
CREATE INDEX "ForumAnnouncement_status_publishedAt_idx" ON "ForumAnnouncement"("status", "publishedAt");
CREATE UNIQUE INDEX "StaffPermissionGrant_userId_permission_key" ON "StaffPermissionGrant"("userId", "permission");

-- AddForeignKey
ALTER TABLE "ForumAnnouncement" ADD CONSTRAINT "ForumAnnouncement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ForumAnnouncement" ADD CONSTRAINT "ForumAnnouncement_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StaffPermissionGrant" ADD CONSTRAINT "StaffPermissionGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffPermissionGrant" ADD CONSTRAINT "StaffPermissionGrant_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
