import "server-only";
import { authEnvSchema, databaseEnvSchema, parseEnvironment, redisEnvSchema, storageEnvSchema } from "./env-schema";

// Validate lazily at the server boundary: static builds do not need infrastructure credentials.
export const getDatabaseEnv = () => parseEnvironment(databaseEnvSchema, process.env);
export const getRedisEnv = () => parseEnvironment(redisEnvSchema, process.env);
export const getStorageEnv = () => parseEnvironment(storageEnvSchema, process.env);
export const getAuthEnv = () => {
  const env = parseEnvironment(authEnvSchema, process.env);
  if (process.env.NODE_ENV === "production" && !env.NEXTAUTH_URL.startsWith("https://")) {
    throw new Error("NEXTAUTH_URL must use HTTPS in production");
  }
  if (process.env.NODE_ENV === "production" && env.AUTH_BOOTSTRAP_ENABLED) {
    throw new Error("AUTH_BOOTSTRAP_ENABLED must be false in production");
  }
  if (new Set([env.NEXTAUTH_SECRET, env.AUTH_SESSION_SECRET, env.AUTH_TOTP_ENCRYPTION_KEY]).size !== 3) {
    throw new Error("NEXTAUTH_SECRET, AUTH_SESSION_SECRET and AUTH_TOTP_ENCRYPTION_KEY must be independent");
  }
  if (!/^[A-Za-z0-9+/]{43}=$/.test(env.AUTH_TOTP_ENCRYPTION_KEY)) {
    throw new Error("AUTH_TOTP_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  }
  return env;
};
