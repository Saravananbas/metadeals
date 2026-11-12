import "dotenv/config";
import { defineConfig } from "prisma/config";

const databaseProvider = process.env.DATABASE_PROVIDER ??
  (process.env.DATABASE_URL?.startsWith("mysql:") ? "mysql" : "postgresql");

if (databaseProvider !== "postgresql" && databaseProvider !== "mysql") {
  throw new Error("DATABASE_PROVIDER must be either postgresql or mysql.");
}

const usesMariaDb = databaseProvider === "mysql";
const urlProtocol = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).protocol : undefined;

if (urlProtocol && (usesMariaDb ? urlProtocol !== "mysql:" : !["postgres:", "postgresql:"].includes(urlProtocol))) {
  throw new Error("DATABASE_PROVIDER must match the DATABASE_URL protocol.");
}

export default defineConfig({
  schema: usesMariaDb ? "prisma/schema.mariadb.prisma" : "prisma/schema.prisma",
  migrations: { path: usesMariaDb ? "prisma/migrations_mariadb" : "prisma/migrations" },
  datasource: { url: process.env.DATABASE_URL },
});
