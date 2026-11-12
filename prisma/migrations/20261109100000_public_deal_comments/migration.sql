CREATE TABLE IF NOT EXISTS "DealComment" (
  "id" TEXT NOT NULL,
  "dealId" TEXT NOT NULL,
  "authorName" VARCHAR(80) NOT NULL DEFAULT 'Guest',
  "content" VARCHAR(1000) NOT NULL,
  "authorIpHash" CHAR(64),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DealComment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DealComment_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "DealComment_dealId_createdAt_idx" ON "DealComment"("dealId", "createdAt");
CREATE INDEX IF NOT EXISTS "DealComment_authorIpHash_createdAt_idx" ON "DealComment"("authorIpHash", "createdAt");
