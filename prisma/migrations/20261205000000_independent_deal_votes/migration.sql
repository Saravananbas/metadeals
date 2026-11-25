-- A member or browser can now like and dislike a deal independently, so one vote row per kind instead of one per deal.
-- CreateIndex
CREATE UNIQUE INDEX "DealVote_customerId_dealId_value_key" ON "DealVote"("customerId", "dealId", "value");

-- CreateIndex
CREATE UNIQUE INDEX "DealVote_visitorId_dealId_value_key" ON "DealVote"("visitorId", "dealId", "value");

-- DropIndex
DROP INDEX "DealVote_customerId_dealId_key";

-- DropIndex
DROP INDEX "DealVote_visitorId_dealId_key";
