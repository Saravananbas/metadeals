import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient as PgPrismaClient } from "@/generated/prisma/client";
import { PrismaClient as MariaPrismaClient } from "@/generated/prisma-mariadb/client";
import { getDatabaseEnv } from "@/config/env";

const globalForPrisma = globalThis as unknown as { prisma?: PgPrismaClient };

export function getDatabase(): PgPrismaClient {
  if (!globalForPrisma.prisma) {
    const { DATABASE_URL: dbUrl, DATABASE_PROVIDER, DATABASE_SSL } = getDatabaseEnv();
    const parsedUrl = new URL(dbUrl);
    const provider = DATABASE_PROVIDER ?? (parsedUrl.protocol === "mysql:" ? "mysql" : "postgresql");
    const adapter = provider === "mysql"
      ? new PrismaMariaDb({
          host: parsedUrl.hostname,
          port: Number(parsedUrl.port || 3306),
          user: decodeURIComponent(parsedUrl.username),
          password: decodeURIComponent(parsedUrl.password),
          database: decodeURIComponent(parsedUrl.pathname.slice(1)),
          connectionLimit: 5,
          connectTimeout: 15_000,
          acquireTimeout: 15_000,
          ssl: DATABASE_SSL ? { rejectUnauthorized: true } : undefined,
        })
      : new PrismaPg({
          connectionString: dbUrl,
          max: 20,
          connectionTimeoutMillis: 15000,
          idleTimeoutMillis: 30000,
          statement_timeout: 15000,
        });
    globalForPrisma.prisma = provider === "mysql"
      ? new MariaPrismaClient({ adapter: adapter as PrismaMariaDb }) as unknown as PgPrismaClient
      : new PgPrismaClient({ adapter: adapter as PrismaPg });
  }

  return globalForPrisma.prisma;
}

export async function disconnectDatabase(): Promise<void> {
  if (globalForPrisma.prisma) {
    await globalForPrisma.prisma.$disconnect();
    globalForPrisma.prisma = undefined;
  }
}
