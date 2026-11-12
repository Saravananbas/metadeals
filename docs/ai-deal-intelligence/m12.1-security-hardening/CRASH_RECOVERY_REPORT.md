# Crash Recovery & Reconciliation Report

## Overview
Worker: `PublishingReconciliationWorker` in `src/server/scraper/reconciliation-worker.ts`.

## Failure Scenarios Tested
1. **Crash after Claim / during Publishing (No Deal Created):**
   - Authorization was stuck in `PUBLISHING` status with no Deal record created.
   - Reconciliation detected the timeout (>5m), marked status `RECOVERY_REQUIRED`, and recorded an audit log.
2. **Crash after Deal Creation (Deal Committed, Auth not marked PUBLISHED):**
   - Reconciliation discovered the existing Deal linked to the candidate.
   - Successfully reconciled the authorization to `PUBLISHED` status without re-publishing or duplicating data.

