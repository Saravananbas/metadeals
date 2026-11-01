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
  return env;
};
