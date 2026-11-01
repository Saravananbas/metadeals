import "server-only";
import pino from "pino";

const allowedLevels = ["fatal", "error", "warn", "info", "debug", "trace", "silent"];
const requestedLevel = process.env.LOG_LEVEL ?? "info";

export const logger = pino({
  name: "metadeals4u",
  level: allowedLevels.includes(requestedLevel) ? requestedLevel : "info",
  base: { service: "metadeals4u" },
  redact: {
    paths: ["password", "secret", "token", "authorization", "cookie", "DATABASE_URL", "REDIS_URL", "NEXTAUTH_SECRET", "S3_SECRET_ACCESS_KEY", "req.headers.authorization", "req.headers.cookie"],
    censor: "[REDACTED]",
  },
});
