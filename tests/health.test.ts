import assert from "node:assert/strict";
import test from "node:test";
import { checkReadiness } from "../src/features/health/service";

test("readiness succeeds only when both dependencies respond", async () => {
  const result = await checkReadiness({ database: async () => 1, redis: async () => "PONG" });
  assert.equal(result.ready, true);
  assert.deepEqual(result.checks, { database: "up", redis: "up" });
});

test("failed dependency returns unavailable without leaking its error", async () => {
  const result = await checkReadiness({
    database: async () => { throw new Error("postgresql://private:password@internal/db"); },
    redis: async () => "PONG",
  });
  assert.equal(result.ready, false);
  assert.equal(result.status, "unavailable");
  assert.deepEqual(result.checks, { database: "down", redis: "up" });
  assert.equal(JSON.stringify(result).includes("password"), false);
});

test("all dependency failures are contained", async () => {
  const fail = async () => { throw new Error("unreachable"); };
  const result = await checkReadiness({ database: fail, redis: fail });
  assert.deepEqual(result.checks, { database: "down", redis: "down" });
  assert.equal(result.ready, false);
});
