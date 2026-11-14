-- Community moderator: additive only. Appends a role value, adds one nullable link column on User, and creates new tables. No data is changed or removed.

-- AlterTable
ALTER TABLE `AuthToken` MODIFY `role` ENUM('SUPER_ADMIN', 'ADMIN', 'EDITOR', 'COMMUNITY_MODERATOR') NULL;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `linkedCustomerId` VARCHAR(191) NULL,
    MODIFY `role` ENUM('SUPER_ADMIN', 'ADMIN', 'EDITOR', 'COMMUNITY_MODERATOR') NOT NULL DEFAULT 'EDITOR';

-- CreateTable
CREATE TABLE `ModeratorAppointment` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `invitedById` VARCHAR(191) NOT NULL,
    `staffUserId` VARCHAR(191) NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'INVITED',
    `inviteHash` CHAR(64) NULL,
    `inviteExpiresAt` DATETIME(3) NULL,
    `inviteNote` VARCHAR(300) NULL,
    `guidelinesVersion` VARCHAR(20) NULL,
    `guidelinesAcceptedAt` DATETIME(3) NULL,
    `acceptedAt` DATETIME(3) NULL,
    `probationEndsAt` DATETIME(3) NULL,
    `extensions` INTEGER NOT NULL DEFAULT 0,
    `confirmedAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ModeratorAppointment_staffUserId_key`(`staffUserId`),
    UNIQUE INDEX `ModeratorAppointment_inviteHash_key`(`inviteHash`),
    INDEX `ModeratorAppointment_customerId_status_idx`(`customerId`, `status`),
    INDEX `ModeratorAppointment_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ModeratorAppointmentEvent` (
    `id` VARCHAR(191) NOT NULL,
    `appointmentId` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `action` VARCHAR(30) NOT NULL,
    `reason` VARCHAR(300) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ModeratorAppointmentEvent_appointmentId_createdAt_idx`(`appointmentId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MemberWarning` (
    `id` VARCHAR(191) NOT NULL,
    `profileId` VARCHAR(191) NOT NULL,
    `issuedById` VARCHAR(191) NOT NULL,
    `reason` VARCHAR(300) NOT NULL,
    `postId` VARCHAR(191) NULL,
    `commentId` VARCHAR(191) NULL,
    `status` VARCHAR(10) NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MemberWarning_profileId_createdAt_idx`(`profileId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MemberRestriction` (
    `id` VARCHAR(191) NOT NULL,
    `profileId` VARCHAR(191) NOT NULL,
    `scope` VARCHAR(12) NOT NULL DEFAULT 'POSTING',
    `startsAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,
    `reason` VARCHAR(300) NOT NULL,
    `issuedById` VARCHAR(191) NOT NULL,
    `issuedByRole` VARCHAR(24) NOT NULL,
    `postId` VARCHAR(191) NULL,
    `commentId` VARCHAR(191) NULL,
    `reportId` VARCHAR(191) NULL,
    `revokedAt` DATETIME(3) NULL,
    `revokedById` VARCHAR(191) NULL,
    `revokeReason` VARCHAR(300) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MemberRestriction_profileId_expiresAt_idx`(`profileId`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ModerationAppeal` (
    `id` VARCHAR(191) NOT NULL,
    `profileId` VARCHAR(191) NOT NULL,
    `targetType` VARCHAR(12) NOT NULL,
    `targetId` VARCHAR(191) NOT NULL,
    `originalActorId` VARCHAR(191) NOT NULL,
    `message` VARCHAR(1000) NOT NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'OPEN',
    `decidedById` VARCHAR(191) NULL,
    `decidedAt` DATETIME(3) NULL,
    `decisionNote` VARCHAR(500) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ModerationAppeal_status_createdAt_idx`(`status`, `createdAt`),
    UNIQUE INDEX `ModerationAppeal_profileId_targetType_targetId_key`(`profileId`, `targetType`, `targetId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ModerationEscalation` (
    `id` VARCHAR(191) NOT NULL,
    `targetType` VARCHAR(10) NOT NULL,
    `targetId` VARCHAR(191) NOT NULL,
    `category` VARCHAR(30) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `status` VARCHAR(10) NOT NULL DEFAULT 'OPEN',
    `handledById` VARCHAR(191) NULL,
    `handledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ModerationEscalation_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `User_linkedCustomerId_key` ON `User`(`linkedCustomerId`);

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_linkedCustomerId_fkey` FOREIGN KEY (`linkedCustomerId`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ModeratorAppointment` ADD CONSTRAINT `ModeratorAppointment_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ModeratorAppointment` ADD CONSTRAINT `ModeratorAppointment_invitedById_fkey` FOREIGN KEY (`invitedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ModeratorAppointment` ADD CONSTRAINT `ModeratorAppointment_staffUserId_fkey` FOREIGN KEY (`staffUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ModeratorAppointmentEvent` ADD CONSTRAINT `ModeratorAppointmentEvent_appointmentId_fkey` FOREIGN KEY (`appointmentId`) REFERENCES `ModeratorAppointment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MemberWarning` ADD CONSTRAINT `MemberWarning_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `ForumProfile`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MemberWarning` ADD CONSTRAINT `MemberWarning_issuedById_fkey` FOREIGN KEY (`issuedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MemberRestriction` ADD CONSTRAINT `MemberRestriction_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `ForumProfile`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MemberRestriction` ADD CONSTRAINT `MemberRestriction_issuedById_fkey` FOREIGN KEY (`issuedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ModerationAppeal` ADD CONSTRAINT `ModerationAppeal_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `ForumProfile`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
