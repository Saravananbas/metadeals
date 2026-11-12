import assert from "node:assert/strict";
import test from "node:test";
import { readJson } from "../src/server/auth/request";

test("JSON body limit can be raised only by the calling endpoint and remains bounded", async () => {
  const html = "x".repeat(20_000);
  const requestWith = (value: unknown) => new Request("http://localhost/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  });

  await assert.rejects(readJson(requestWith({ html })), /too large/i);
  const parsed = await readJson(requestWith({ html }), 1_000_000) as { html: string };
  assert.equal(parsed.html.length, html.length);
  await assert.rejects(readJson(requestWith({ html: "x".repeat(1_000_001) }), 1_000_000), /too large/i);
});
