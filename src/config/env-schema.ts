import { z } from "zod";

const urlWithProtocols = (protocols: string[]) => z.string().url().refine(
  (value) => protocols.includes(new URL(value).protocol),
  "Unsupported URL protocol",
);

export const databaseEnvSchema = z.object({
  DATABASE_URL: urlWithProtocols(["postgres:", "postgresql:"]),
});
export const redisEnvSchema = z.object({
  REDIS_URL: urlWithProtocols(["redis:", "rediss:"]),
});
export const authEnvSchema = z.object({
  NEXTAUTH_SECRET: z.string().min(32),
  NEXTAUTH_URL: urlWithProtocols(["http:", "https:"]),
});
export const storageEnvSchema = z.object({
  S3_ENDPOINT: urlWithProtocols(["http:", "https:"]),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(3),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
});

/** Reports variable names only; never echo secret values or connection strings. */
export function parseEnvironment<T>(schema: z.ZodType<T>, source: Record<string, string | undefined>): T {
  const result = schema.safeParse(source);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((issue) => issue.path.join(".")))];
    throw new Error(`Missing or invalid environment variables: ${names.join(", ")}`);
  }
  return result.data;
}
