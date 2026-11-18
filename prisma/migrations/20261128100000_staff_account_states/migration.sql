-- Staff account states: additive only. Two new status values (Disabled, Deleted) and three nullable suspension columns on User. No data is changed or removed.

ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'DISABLED';
ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'DELETED';

ALTER TABLE "User" ADD COLUMN "suspendedFrom" TIMESTAMP(3),
ADD COLUMN "suspendedUntil" TIMESTAMP(3),
ADD COLUMN "suspensionReason" VARCHAR(300);
