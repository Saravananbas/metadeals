# Redis Replay Protection Specification

## Architecture
- **Store:** Shared Redis cluster via `getSharedRedis()`.
- **Command:** `SET tg:consumed:<digest> 1 NX EX 900`
- **Digest Computation:** SHA-256 over `${action}:${candidateId}:${timestamp}:${telegramUserId}`.
- **Single-Use Invariant:** Redis `SET NX` returns `OK` exactly once. Subsequent calls within the TTL window return `null` and are rejected with `REPLAY_ATTACK_DETECTED`.
- **Fail-Closed Strategy:** If Redis is down, callback verification throws or rejects with `REDIS_UNAVAILABLE` rather than defaulting to open execution.

