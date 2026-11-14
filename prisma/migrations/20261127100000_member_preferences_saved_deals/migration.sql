-- Member preferences and server-side saved deals: additive only (two new tables). PostgreSQL copy, written to match; NOT executed anywhere.
CREATE TABLE "CustomerPreference" (
    "customerId" TEXT NOT NULL,
    "dealAlerts" BOOLEAN NOT NULL DEFAULT true,
    "emailUpdates" BOOLEAN NOT NULL DEFAULT true,
    "frequency" VARCHAR(10) NOT NULL DEFAULT 'IMMEDIATE',
    "categorySlugs" VARCHAR(1000),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomerPreference_pkey" PRIMARY KEY ("customerId")
);
CREATE TABLE "SavedDeal" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SavedDeal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SavedDeal_customerId_createdAt_idx" ON "SavedDeal"("customerId", "createdAt");
CREATE UNIQUE INDEX "SavedDeal_customerId_dealId_key" ON "SavedDeal"("customerId", "dealId");
ALTER TABLE "CustomerPreference" ADD CONSTRAINT "CustomerPreference_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SavedDeal" ADD CONSTRAINT "SavedDeal_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SavedDeal" ADD CONSTRAINT "SavedDeal_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
