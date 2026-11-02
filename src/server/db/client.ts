import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getDatabaseEnv } from "@/config/env";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function getDatabase(): PrismaClient {
  if (!globalForPrisma.prisma) {
    const adapter = new PrismaPg({
      connectionString: getDatabaseEnv().DATABASE_URL,
      max: 10,
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 30000,
      statement_timeout: 3000,
    });
    globalForPrisma.prisma = new PrismaClient({ adapter });
  }
  return globalForPrisma.prisma;
}

export async function disconnectDatabase(): Promise<void> {
  if (globalForPrisma.prisma) await globalForPrisma.prisma.$disconnect();
}
