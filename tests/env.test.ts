import assert from "node:assert/strict";
import test from "node:test";
import { authEnvSchema, databaseEnvSchema, parseEnvironment, redisEnvSchema, storageEnvSchema } from "../src/config/env-schema";

test("database configuration rejects other protocols without exposing values", () => {
  assert.throws(
    () => parseEnvironment(databaseEnvSchema, { DATABASE_URL: "https://private:secret@example.org" }),
    (error: Error) => error.message === "Missing or invalid environment variables: DATABASE_URL",
  );
});

test("missing database configuration fails closed", () => {
  assert.throws(() => parseEnvironment(databaseEnvSchema, {}), /DATABASE_URL/);
});

test("auth rejects short secrets", () => {
  assert.equal(authEnvSchema.safeParse({ NEXTAUTH_SECRET: "short", NEXTAUTH_URL: "https://example.org" }).success, false);
});

test("Redis accepts TLS and rejects HTTP", () => {
  assert.equal(redisEnvSchema.safeParse({ REDIS_URL: "rediss://localhost:6379" }).success, true);
  assert.equal(redisEnvSchema.safeParse({ REDIS_URL: "https://localhost:6379" }).success, false);
});

test("storage interprets the literal false correctly", () => {
  const result = storageEnvSchema.parse({
    S3_ENDPOINT: "https://storage.example.org", S3_REGION: "test", S3_BUCKET: "test-bucket",
    S3_ACCESS_KEY_ID: "test-only", S3_SECRET_ACCESS_KEY: "test-only", S3_FORCE_PATH_STYLE: "false",
  });
  assert.equal(result.S3_FORCE_PATH_STYLE, false);
});
