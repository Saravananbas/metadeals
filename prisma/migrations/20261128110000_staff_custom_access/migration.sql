-- Per-person access: additive only. Two new columns on User; the person's chosen permissions live in the existing StaffPermissionGrant table. No data is changed or removed.

ALTER TABLE "User" ADD COLUMN "customAccess" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "customAccessUntil" TIMESTAMP(3);
