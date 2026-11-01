import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout } from "node:timers/promises";

// HTTP integration checks against a production build. No external services are mutated.
async function withServer(port, overrides, run) {
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, ...overrides },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const exited = new Promise((resolve) => child.once("exit", resolve));
  const base = `http://127.0.0.1:${port}`;
  try {
    let available = false;
    for (let attempt = 0; attempt < 80; attempt++) {
      if (child.exitCode !== null) throw new Error("Test server exited before readiness");
      try {
        const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1000) });
        if (response.ok && output.includes("Ready")) { available = true; break; }
      } catch { /* Startup is not ready yet. */ }
      await setTimeout(250);
    }
    assert.ok(available, "Production server must start");
    await run(base);
  } finally {
    child.kill();
    await exited;
  }
}

await withServer(3105, {}, async (base) => {
  const home = await fetch(base);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /MetaDeals/);
  assert.equal(home.headers.get("x-content-type-options"), "nosniff");
  assert.equal(home.headers.get("x-frame-options"), "DENY");
  const live = await fetch(`${base}/api/health`);
  assert.equal(live.status, 200);
  assert.equal(live.headers.get("cache-control"), "no-store");
  assert.equal((await live.json()).status, "ok");
  const ready = await fetch(`${base}/api/health/ready`);
  assert.equal(ready.status, 200);
  assert.deepEqual((await ready.json()).checks, { database: "up", redis: "up" });
  assert.equal((await fetch(`${base}/not-a-real-page`)).status, 404);
  assert.equal((await fetch(`${base}/api/auth/session`)).status, 404, "Auth is not enabled in M0");
  console.log("PASS production homepage, headers, liveness, live DB/Redis readiness, 404, disabled auth");
});

await withServer(3106, {
  DATABASE_URL: "postgresql://test-only:never-a-real-secret@127.0.0.1:1/unavailable",
  REDIS_URL: "redis://127.0.0.1:1/0",
}, async (base) => {
  const ready = await fetch(`${base}/api/health/ready`, { signal: AbortSignal.timeout(12000) });
  assert.equal(ready.status, 503);
  assert.equal(ready.headers.get("cache-control"), "no-store");
  assert.ok(ready.headers.get("x-request-id"));
  const body = await ready.text();
  assert.deepEqual(JSON.parse(body).checks, { database: "down", redis: "down" });
  assert.doesNotMatch(body, /never-a-real-secret|postgresql|ECONNREFUSED|stack/);
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
  console.log("PASS dependency failure returns sanitized 503 while liveness stays 200");
});
