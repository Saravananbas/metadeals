import assert from "node:assert/strict";
import test from "node:test";
import { databaseFailure } from "../src/features/health/database-failure";

test("database failures get a short label that never contains the message", () => {
  assert.equal(databaseFailure(new URIError("URI malformed")), "password_encoding");
  assert.equal(databaseFailure(Object.assign(new Error("Access denied for user 'x'@'h' (using password: YES)"), { errno: 1045 })), "login_refused");
  assert.equal(databaseFailure(Object.assign(new Error("db access"), { errno: 1044 })), "no_privileges");
  assert.equal(databaseFailure(new Error("Unknown database 'x'")), "unknown_database");
  assert.equal(databaseFailure(Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:3306"), { code: "ECONNREFUSED" })), "connection_refused");
  assert.equal(databaseFailure(new Error("pool timeout: failed to retrieve a connection from pool after 15000ms")), "timeout");
  assert.equal(databaseFailure(new Error("Too many connections")), "too_many_connections");
  assert.equal(databaseFailure(new Error("something else")), "other");
});
