// Usage: node scripts/perf-check.mjs [baseUrl]   (default http://localhost:4123; use a production build or staging)
const base = (process.argv[2] ?? process.env.PERF_BASE_URL ?? "http://localhost:4123").replace(/\/$/, "");
const budgets = [
  ["/", 800], ["/api/v1/deals?limit=15", 400], ["/api/v1/home-deals", 400], ["/api/v1/catalog", 400], ["/community", 800], ["/privacy", 500],
];
let failed = false;
for (const [path, limit] of budgets) {
  const times = [];
  let bytes = 0, status = 0;
  for (let i = 0; i < 4; i++) {
    const t = performance.now();
    const res = await fetch(base + path, { headers: { "accept-encoding": "gzip" } });
    bytes = (await res.arrayBuffer()).byteLength; status = res.status;
    times.push(performance.now() - t);
  }
  times.shift(); // first run warms caches
  const p = Math.max(...times);
  const bad = status >= 400 || p > limit;
  failed ||= bad;
  console.log(`${bad ? "FAIL" : "ok  "} ${path} ${status} worst ${p.toFixed(0)} ms (budget ${limit}) ${(bytes / 1024).toFixed(0)} KB`);
}
process.exit(failed ? 1 : 0);
