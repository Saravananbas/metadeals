-- CreateTable
CREATE TABLE "AnalyticsSession" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activeSeconds" INTEGER NOT NULL DEFAULT 0,
    "pageCount" INTEGER NOT NULL DEFAULT 0,
    "entryPath" VARCHAR(300) NOT NULL,
    "exitPath" VARCHAR(300) NOT NULL,
    "referrerHost" VARCHAR(150),
    "utmSource" VARCHAR(100),
    "utmMedium" VARCHAR(100),
    "utmCampaign" VARCHAR(100),
    "channel" VARCHAR(30),
    "deviceType" VARCHAR(20) NOT NULL,
    "browser" VARCHAR(30) NOT NULL,
    "os" VARCHAR(30) NOT NULL,
    "returning" BOOLEAN NOT NULL DEFAULT false,
    "customerId" VARCHAR(191),

    CONSTRAINT "AnalyticsSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT,
    "visitorHash" VARCHAR(32) NOT NULL,
    "type" VARCHAR(30) NOT NULL,
    "path" VARCHAR(300) NOT NULL,
    "pageType" VARCHAR(20) NOT NULL,
    "dealId" VARCHAR(191),
    "merchantId" VARCHAR(191),
    "categoryId" VARCHAR(191),
    "referrerHost" VARCHAR(150),
    "channel" VARCHAR(30),
    "deviceType" VARCHAR(20),
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsDaily" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "dimension" VARCHAR(20) NOT NULL,
    "key" VARCHAR(191) NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "visitors" INTEGER NOT NULL DEFAULT 0,
    "sessions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "activeSeconds" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AnalyticsDaily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnalyticsSession_startedAt_idx" ON "AnalyticsSession"("startedAt");

-- CreateIndex
CREATE INDEX "AnalyticsSession_lastSeenAt_idx" ON "AnalyticsSession"("lastSeenAt");

-- CreateIndex
CREATE INDEX "AnalyticsSession_customerId_idx" ON "AnalyticsSession"("customerId");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_createdAt_idx" ON "AnalyticsEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_type_createdAt_idx" ON "AnalyticsEvent"("type", "createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_dealId_createdAt_idx" ON "AnalyticsEvent"("dealId", "createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_merchantId_createdAt_idx" ON "AnalyticsEvent"("merchantId", "createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_sessionId_createdAt_idx" ON "AnalyticsEvent"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_pageType_createdAt_idx" ON "AnalyticsEvent"("pageType", "createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsDaily_dimension_date_idx" ON "AnalyticsDaily"("dimension", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsDaily_date_dimension_key_key" ON "AnalyticsDaily"("date", "dimension", "key");

-- AddForeignKey
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AnalyticsSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

