-- Additive only: member follows, staff-granted verified flag, push device tokens, app refresh tokens.
ALTER TABLE "ForumProfile" ADD COLUMN "verifiedAt" TIMESTAMP(3), ADD COLUMN "verifiedById" VARCHAR(191);

ALTER TABLE "CustomerAppToken" ADD COLUMN "refreshHash" CHAR(64), ADD COLUMN "prevRefreshHash" CHAR(64), ADD COLUMN "refreshExpiresAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "CustomerAppToken_refreshHash_key" ON "CustomerAppToken"("refreshHash");

CREATE TABLE "ForumMemberFollow" (
    "id" TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "followedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ForumMemberFollow_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ForumMemberFollow_followerId_followedId_key" ON "ForumMemberFollow"("followerId", "followedId");
CREATE INDEX "ForumMemberFollow_followedId_idx" ON "ForumMemberFollow"("followedId");

CREATE TABLE "DevicePushToken" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "platform" VARCHAR(10) NOT NULL,
    "token" VARCHAR(255) NOT NULL,
    "device" VARCHAR(80),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DevicePushToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DevicePushToken_token_key" ON "DevicePushToken"("token");
CREATE INDEX "DevicePushToken_customerId_idx" ON "DevicePushToken"("customerId");

ALTER TABLE "ForumMemberFollow" ADD CONSTRAINT "ForumMemberFollow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "ForumProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ForumMemberFollow" ADD CONSTRAINT "ForumMemberFollow_followedId_fkey" FOREIGN KEY ("followedId") REFERENCES "ForumProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DevicePushToken" ADD CONSTRAINT "DevicePushToken_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
