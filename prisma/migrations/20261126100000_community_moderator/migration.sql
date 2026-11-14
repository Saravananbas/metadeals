-- Community moderator: additive only. Appends a role value, adds one nullable link column on User, and creates new tables. No data is changed or removed.

ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'COMMUNITY_MODERATOR';

ALTER TABLE "User" ADD COLUMN "linkedCustomerId" VARCHAR(191);
CREATE UNIQUE INDEX "User_linkedCustomerId_key" ON "User"("linkedCustomerId");

CREATE TABLE "ModeratorAppointment" (
    "id" TEXT NOT NULL, "customerId" TEXT NOT NULL, "invitedById" TEXT NOT NULL, "staffUserId" TEXT,
    "status" VARCHAR(12) NOT NULL DEFAULT 'INVITED', "inviteHash" CHAR(64), "inviteExpiresAt" TIMESTAMP(3), "inviteNote" VARCHAR(300),
    "guidelinesVersion" VARCHAR(20), "guidelinesAcceptedAt" TIMESTAMP(3), "acceptedAt" TIMESTAMP(3), "probationEndsAt" TIMESTAMP(3),
    "extensions" INTEGER NOT NULL DEFAULT 0, "confirmedAt" TIMESTAMP(3), "revokedAt" TIMESTAMP(3), "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ModeratorAppointment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ModeratorAppointment_staffUserId_key" ON "ModeratorAppointment"("staffUserId");
CREATE UNIQUE INDEX "ModeratorAppointment_inviteHash_key" ON "ModeratorAppointment"("inviteHash");
CREATE INDEX "ModeratorAppointment_customerId_status_idx" ON "ModeratorAppointment"("customerId", "status");
CREATE INDEX "ModeratorAppointment_status_idx" ON "ModeratorAppointment"("status");

CREATE TABLE "ModeratorAppointmentEvent" (
    "id" TEXT NOT NULL, "appointmentId" TEXT NOT NULL, "actorId" VARCHAR(191), "action" VARCHAR(30) NOT NULL, "reason" VARCHAR(300),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ModeratorAppointmentEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ModeratorAppointmentEvent_appointmentId_createdAt_idx" ON "ModeratorAppointmentEvent"("appointmentId", "createdAt");

CREATE TABLE "MemberWarning" (
    "id" TEXT NOT NULL, "profileId" TEXT NOT NULL, "issuedById" TEXT NOT NULL, "reason" VARCHAR(300) NOT NULL, "postId" VARCHAR(191), "commentId" VARCHAR(191),
    "status" VARCHAR(10) NOT NULL DEFAULT 'ACTIVE', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "MemberWarning_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MemberWarning_profileId_createdAt_idx" ON "MemberWarning"("profileId", "createdAt");

CREATE TABLE "MemberRestriction" (
    "id" TEXT NOT NULL, "profileId" TEXT NOT NULL, "scope" VARCHAR(12) NOT NULL DEFAULT 'POSTING', "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL, "reason" VARCHAR(300) NOT NULL, "issuedById" TEXT NOT NULL, "issuedByRole" VARCHAR(24) NOT NULL,
    "postId" VARCHAR(191), "commentId" VARCHAR(191), "reportId" VARCHAR(191), "revokedAt" TIMESTAMP(3), "revokedById" VARCHAR(191), "revokeReason" VARCHAR(300),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "MemberRestriction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MemberRestriction_profileId_expiresAt_idx" ON "MemberRestriction"("profileId", "expiresAt");

CREATE TABLE "ModerationAppeal" (
    "id" TEXT NOT NULL, "profileId" TEXT NOT NULL, "targetType" VARCHAR(12) NOT NULL, "targetId" VARCHAR(191) NOT NULL, "originalActorId" VARCHAR(191) NOT NULL,
    "message" VARCHAR(1000) NOT NULL, "status" VARCHAR(12) NOT NULL DEFAULT 'OPEN', "decidedById" VARCHAR(191), "decidedAt" TIMESTAMP(3), "decisionNote" VARCHAR(500),
    "version" INTEGER NOT NULL DEFAULT 1, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ModerationAppeal_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ModerationAppeal_profileId_targetType_targetId_key" ON "ModerationAppeal"("profileId", "targetType", "targetId");
CREATE INDEX "ModerationAppeal_status_createdAt_idx" ON "ModerationAppeal"("status", "createdAt");

CREATE TABLE "ModerationEscalation" (
    "id" TEXT NOT NULL, "targetType" VARCHAR(10) NOT NULL, "targetId" VARCHAR(191) NOT NULL, "category" VARCHAR(30) NOT NULL, "createdById" VARCHAR(191) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'OPEN', "handledById" VARCHAR(191), "handledAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ModerationEscalation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ModerationEscalation_status_createdAt_idx" ON "ModerationEscalation"("status", "createdAt");

ALTER TABLE "User" ADD CONSTRAINT "User_linkedCustomerId_fkey" FOREIGN KEY ("linkedCustomerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ModeratorAppointment" ADD CONSTRAINT "ModeratorAppointment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ModeratorAppointment" ADD CONSTRAINT "ModeratorAppointment_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ModeratorAppointment" ADD CONSTRAINT "ModeratorAppointment_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ModeratorAppointmentEvent" ADD CONSTRAINT "ModeratorAppointmentEvent_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "ModeratorAppointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MemberWarning" ADD CONSTRAINT "MemberWarning_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ForumProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MemberWarning" ADD CONSTRAINT "MemberWarning_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MemberRestriction" ADD CONSTRAINT "MemberRestriction_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ForumProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MemberRestriction" ADD CONSTRAINT "MemberRestriction_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ModerationAppeal" ADD CONSTRAINT "ModerationAppeal_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ForumProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
