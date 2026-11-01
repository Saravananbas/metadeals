import "server-only";
import type { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { getAuthEnv } from "@/config/env";
import { getDatabase } from "@/server/db/client";
import { logger } from "@/server/logging/logger";

/** Intentionally not exposed as an API until a real identity provider is approved. */
export function getAuthOptions(): NextAuthOptions {
  return {
    adapter: PrismaAdapter(getDatabase()),
    secret: getAuthEnv().NEXTAUTH_SECRET,
    providers: [],
    session: { strategy: "database", maxAge: 30 * 24 * 60 * 60 },
    debug: false,
    logger: {
      error(code) { logger.error({ code }, "Authentication error"); },
      warn(code) { logger.warn({ code }, "Authentication warning"); },
      debug() {},
    },
  };
}
