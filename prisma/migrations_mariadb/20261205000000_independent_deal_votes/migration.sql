-- A member or browser can now like and dislike a deal independently, so one vote row per kind instead of one per deal.
-- New indexes first: the foreign key on customerId needs an index to stay in place while the old one is dropped.
-- CreateIndex
CREATE UNIQUE INDEX `DealVote_customerId_dealId_value_key` ON `DealVote`(`customerId`, `dealId`, `value`);

-- CreateIndex
CREATE UNIQUE INDEX `DealVote_visitorId_dealId_value_key` ON `DealVote`(`visitorId`, `dealId`, `value`);

-- DropIndex
DROP INDEX `DealVote_customerId_dealId_key` ON `DealVote`;

-- DropIndex
DROP INDEX `DealVote_visitorId_dealId_key` ON `DealVote`;
