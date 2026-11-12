import Redis from "ioredis";
import { getRedisEnv, isRedisConfigured } from "@/config/env";
import { logger } from "@/server/logging/logger";

let sharedRedisInstance: Redis | null = null;

export function getSharedRedis(): Redis {
  if (!sharedRedisInstance) {
    const env = getRedisEnv();
    sharedRedisInstance = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      lazyConnect: false,
      retryStrategy: (times) => {
        if (times > 3) return null;
        return Math.min(times * 100, 1000);
      },
    });

    sharedRedisInstance.on("error", (err) => {
      logger.error({ error: err.message }, "Shared Redis connection error");
    });
  }
  return sharedRedisInstance;
}

// shortcut: in-process state when REDIS_URL is unset; correct for a single Node instance only.
const memoryConsumed = new Map<string, number>();
let memoryKillSwitch = false;

export class SharedSecurityStore {
  private static REPLAY_PREFIX = "tg:consumed:";
  private static KILL_SWITCH_KEY = "publishing:kill_switch:active";

  /**
   * Atomic Replay Protection.
   * Uses SET key 1 NX EX 900.
   * Returns true if first consumption; returns false if already consumed or replay attempt.
   * Fails closed (throws) if Redis is unavailable.
   */
  public static async claimTelegramCallback(digestOrSignature: string, ttlSeconds = 900): Promise<boolean> {
    if (!isRedisConfigured()) {
      const now = Date.now();
      for (const [k, expiry] of memoryConsumed) if (expiry <= now) memoryConsumed.delete(k);
      if (memoryConsumed.has(digestOrSignature)) return false;
      memoryConsumed.set(digestOrSignature, now + ttlSeconds * 1000);
      return true;
    }
    const redis = getSharedRedis();
    const key = `${this.REPLAY_PREFIX}${digestOrSignature}`;
    try {
      const result = await redis.set(key, "1", "EX", ttlSeconds, "NX");
      return result === "OK";
    } catch (error) {
      logger.error({ error: (error as Error).message }, "Redis unavailable during replay protection check - failing closed");
      throw new Error(`REDIS_UNAVAILABLE: Replay protection requires active Redis. ${(error as Error).message}`);
    }
  }

  /**
   * Checks whether the global publishing kill switch is active across all cluster instances.
   * Fails closed (throws) if Redis is unavailable.
   */
  public static async isKillSwitchActive(): Promise<boolean> {
    if (!isRedisConfigured()) return memoryKillSwitch;
    const redis = getSharedRedis();
    try {
      const val = await redis.get(this.KILL_SWITCH_KEY);
      return val === "1" || val === "true";
    } catch (error) {
      logger.error({ error: (error as Error).message }, "Redis unavailable during kill switch check - failing closed (blocking publishing)");
      throw new Error(`REDIS_UNAVAILABLE: Kill switch verification failed. Publishing blocked.`);
    }
  }

  /**
   * Toggles the global publishing kill switch.
   */
  public static async setKillSwitch(active: boolean): Promise<void> {
    if (!isRedisConfigured()) { memoryKillSwitch = active; return; }
    const redis = getSharedRedis();
    try {
      if (active) {
        await redis.set(this.KILL_SWITCH_KEY, "1");
      } else {
        await redis.del(this.KILL_SWITCH_KEY);
      }
      logger.warn({ active }, "Global publishing kill switch state updated in shared Redis");
    } catch (error) {
      logger.error({ error: (error as Error).message }, "Failed to update global kill switch in Redis");
      throw error;
    }
  }
}

