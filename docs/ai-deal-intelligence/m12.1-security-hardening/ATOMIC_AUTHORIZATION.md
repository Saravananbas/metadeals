# Atomic Authorization State Machine

## Lifecycle Transitions
```
PENDING_APPROVAL ──(Admin Approved)──► APPROVED ──(Worker Claim)──► CLAIMED
                                                                      │
                                                                 (Publishing)
                                                                      │
                                                                      ▼
                                                                 PUBLISHING
                                                                 │        │
                                                          (Success)   (Failure/Timeout)
                                                                 ▼        ▼
                                                            PUBLISHED  RECOVERY_REQUIRED
```

## Concurrency Guarantees
- The transition from `APPROVED` to `CLAIMED` is performed conditionally:
  ```sql
  UPDATE "PublicationAuthorization"
  SET "status" = 'CLAIMED'
  WHERE "id" = $id AND "status" = 'APPROVED' AND "expiresAt" > NOW();
  ```
- If two or more workers attempt to claim the authorization concurrently, exactly one will update 1 row (`claimed.count === 1`). The rest get `claimed.count === 0` and are immediately rejected.

