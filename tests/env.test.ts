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
  assert.equal(authEnvSchema.safeParse({
    NEXTAUTH_SECRET: "short",
    NEXTAUTH_URL: "https://example.org",
    AUTH_SESSION_SECRET: "also-too-short",
    AUTH_TOTP_ENCRYPTION_KEY: "short",
    AUTH_BOOTSTRAP_EMAIL: "admin@example.org",
  }).success, false);
});

test("auth requires secure independent keys and defaults bootstrap off", () => {
  const config = {
    NEXTAUTH_SECRET: "x".repeat(32),
    NEXTAUTH_URL: "http://localhost:4123",
    AUTH_SESSION_SECRET: "y".repeat(32),
    AUTH_TOTP_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
    AUTH_BOOTSTRAP_EMAIL: "saran.be.2005@gmail.com",
  };
  const parsed = authEnvSchema.parse(config);
  assert.equal(parsed.AUTH_BOOTSTRAP_ENABLED, false);
  assert.equal(parsed.AUTH_SESSION_SECRET, config.AUTH_SESSION_SECRET);
  assert.equal(authEnvSchema.safeParse({ ...config, AUTH_SESSION_SECRET: config.NEXTAUTH_SECRET }).success, false);
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
