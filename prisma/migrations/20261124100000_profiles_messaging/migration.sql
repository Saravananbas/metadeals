-- Additive only: public profile fields, messaging state per participant, shares, send de-duplication, native app tokens.
ALTER TABLE "ForumProfile" ADD COLUMN "displayName" VARCHAR(60), ADD COLUMN "location" VARCHAR(80), ADD COLUMN "lastSeenAt" TIMESTAMP(3);

ALTER TABLE "DmThread" ADD COLUMN "lowDeliveredAt" TIMESTAMP(3), ADD COLUMN "highDeliveredAt" TIMESTAMP(3), ADD COLUMN "lowMutedAt" TIMESTAMP(3), ADD COLUMN "highMutedAt" TIMESTAMP(3), ADD COLUMN "lowArchivedAt" TIMESTAMP(3), ADD COLUMN "highArchivedAt" TIMESTAMP(3), ADD COLUMN "lowClearedAt" TIMESTAMP(3), ADD COLUMN "highClearedAt" TIMESTAMP(3);

ALTER TABLE "DmMessage" ADD COLUMN "kind" VARCHAR(12) NOT NULL DEFAULT 'TEXT', ADD COLUMN "refId" VARCHAR(191), ADD COLUMN "clientId" VARCHAR(40);
CREATE UNIQUE INDEX "DmMessage_senderId_clientId_key" ON "DmMessage"("senderId", "clientId");

CREATE TABLE "CustomerAppToken" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "device" VARCHAR(80),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerAppToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CustomerAppToken_tokenHash_key" ON "CustomerAppToken"("tokenHash");
CREATE INDEX "CustomerAppToken_customerId_idx" ON "CustomerAppToken"("customerId");
ALTER TABLE "CustomerAppToken" ADD CONSTRAINT "CustomerAppToken_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
