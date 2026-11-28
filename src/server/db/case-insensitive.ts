/**
 * Prisma's `mode: "insensitive"` exists on PostgreSQL only; on MariaDB/MySQL it is rejected ("Unknown argument `mode`") and the request fails.
 * MariaDB's default collation (utf8mb4_unicode_ci) already ignores case, so there the option is simply left out.
 * Use as: { name: { contains: q, ...ci() } }
 */
export const ci = (): { mode?: "insensitive" } => ((process.env.DATABASE_URL ?? "").startsWith("mysql:") ? {} : { mode: "insensitive" as const });
