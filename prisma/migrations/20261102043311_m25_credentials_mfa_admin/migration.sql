-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'EDITOR');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING_SETUP', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "AuthTokenPurpose" AS ENUM ('ACCOUNT_SETUP', 'PASSWORD_RESET', 'SUPER_ADMIN_BOOTSTRAP');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastTotpStep" BIGINT NOT NULL DEFAULT -1,
ADD COLUMN     "passwordHash" VARCHAR(255),
ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'EDITOR',
ADD COLUMN     "status" "UserStatus" NOT NULL DEFAULT 'PENDING_SETUP',
ADD COLUMN     "totpEnabledAt" TIMESTAMP(3),
ADD COLUMN     "totpSecretEncrypted" TEXT;

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "absoluteExpiresAt" TIMESTAMP(3) NOT NULL,
    "ipHash" CHAR(64),
    "userAgent" VARCHAR(512),

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" VARCHAR(255) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecoveryCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthToken" (
    "id" TEXT NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "purpose" "AuthTokenPurpose" NOT NULL,
    "email" TEXT NOT NULL,
    "userId" TEXT,
    "role" "UserRole",
    "createdById" TEXT,
    "passwordHash" VARCHAR(255),
    "totpSecretEncrypted" TEXT,
    "emailDeliveryVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "AuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthRateLimit" (
    "subjectHash" CHAR(64) NOT NULL,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthRateLimit_pkey" PRIMARY KEY ("subjectHash")
);

-- CreateTable
CREATE TABLE "BootstrapState" (
    "id" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BootstrapState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" VARCHAR(80) NOT NULL,
    "targetId" VARCHAR(128),
    "success" BOOLEAN NOT NULL,
    "requestId" VARCHAR(64),
    "ipHash" CHAR(64),
    "userAgent" VARCHAR(512),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthSession_userId_expiresAt_idx" ON "AuthSession"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");

-- CreateIndex
CREATE INDEX "RecoveryCode_userId_usedAt_idx" ON "RecoveryCode"("userId", "usedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuthToken_tokenHash_key" ON "AuthToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthToken_email_purpose_expiresAt_idx" ON "AuthToken"("email", "purpose", "expiresAt");

-- CreateIndex
CREATE INDEX "AuthToken_userId_purpose_idx" ON "AuthToken"("userId", "purpose");

-- CreateIndex
CREATE INDEX "AuthRateLimit_updatedAt_idx" ON "AuthRateLimit"("updatedAt");

-- CreateIndex
CREATE INDEX "AuthRateLimit_lockedUntil_idx" ON "AuthRateLimit"("lockedUntil");

-- CreateIndex
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_actorId_createdAt_idx" ON "AuditEvent"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_action_createdAt_idx" ON "AuditEvent"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_targetId_idx" ON "AuditEvent"("targetId");

-- CreateIndex
CREATE INDEX "User_role_status_idx" ON "User"("role", "status");

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryCode" ADD CONSTRAINT "RecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthToken" ADD CONSTRAINT "AuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthToken" ADD CONSTRAINT "AuthToken_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
