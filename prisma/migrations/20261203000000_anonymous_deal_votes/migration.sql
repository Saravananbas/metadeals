-- AlterTable
ALTER TABLE "DealVote" ADD COLUMN "visitorId" VARCHAR(40),
    ALTER COLUMN "customerId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "DealVote_visitorId_dealId_key" ON "DealVote"("visitorId", "dealId");
