import assert from "node:assert/strict";
import test from "node:test";

// Read-only checks against whatever database DATABASE_URL points at (the tabs only SELECT).
process.env.NEXTAUTH_SECRET ??= "test-nextauth-secret-0123456789abcdef0123";
process.env.AUTH_SESSION_SECRET ??= "test-session-secret-0123456789abcdef0123";
process.env.AUTH_TOTP_ENCRYPTION_KEY ??= "dGVzdC10b3RwLWtleS1mb3ItYW5hbHl0aWNzLXRlc3Q=";
process.env.AUTH_BOOTSTRAP_EMAIL ??= "test@example.com";

test("source classification only claims what the record proves", async () => {
  const { classifySource } = await import("../src/server/analytics/tabs");
  assert.equal(classifySource(null, null), "Direct / unknown");
  assert.equal(classifySource("www.google.com", null), "Search");
  assert.equal(classifySource("l.facebook.com", null), "Social");
  assert.equal(classifySource(null, "telegram"), "Telegram");
  assert.equal(classifySource("t.me", null), "Telegram");
  assert.equal(classifySource(null, "whatsapp"), "WhatsApp");
  assert.equal(classifySource("example-blog.com", null), "Other referral");
});

test("every tab and CSV export runs, and exports neutralise spreadsheet formulas", { skip: process.env.DATABASE_URL ? false : "needs DATABASE_URL" }, async () => {
  await import("dotenv/config");
  const { resolveRange } = await import("../src/server/analytics/queries");
  const { TABS, getTab, exportCsv } = await import("../src/server/analytics/tabs");
  const range = resolveRange("7d");
  for (const tab of TABS) {
    assert.ok(await getTab(tab, range), `${tab} data`);
    const csv = await exportCsv(tab, range);
    assert.match(csv.split("\n")[0], /MetaDeals4U analytics - /);
    for (const line of csv.split("\n")) assert.ok(!/^[=+@]/.test(line), `formula-like line in ${tab}: ${line.slice(0, 30)}`);
  }
  const revenue = (await getTab("revenue", range)) as { kpis: { approvedMinor: number; earningsPerClickMinor: number | null } };
  assert.ok(revenue.kpis.approvedMinor >= 0);
});
