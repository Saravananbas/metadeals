// Runs the in-app Node extraction pipeline (no Python) over a URL list so it can be compared with the Python engine.
// Usage: node --conditions=react-server --import tsx scripts/node-extraction-baseline.ts <urls.txt> <out.json>
import { readFileSync, writeFileSync } from "node:fs";
import { adapterRegistry } from "../src/server/product-extraction/core/registry";
import { applyDeterministicFieldFallback } from "../src/server/product-extraction/core/strategy-engine";
import { safeFetchText } from "../src/server/product-extraction/security/fetch-policy";

const [listPath, outPath] = process.argv.slice(2);
const urls = [...new Set(readFileSync(listPath, "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l.startsWith("http")))];

async function run(raw: string) {
  const started = Date.now();
  try {
    const url = new URL(raw);
    const { text, finalUrl } = await safeFetchText(raw, { allowedDomains: [url.hostname, url.hostname.replace(/^www\./, ""), `www.${url.hostname.replace(/^www\./, "")}`] });
    const adapter = adapterRegistry.findAdapterForUrl(url) ?? adapterRegistry.getAdapterById("generic-structured-data")!;
    const base = await adapter.extract({ url, rawUrl: raw, html: text, htmlFixture: text, importImage: false } as never);
    const r = applyDeterministicFieldFallback(base, text, finalUrl);
    return { u: raw, ok: true, t: Date.now() - started, adapter: adapter.id, title: Boolean(r.identity.title.value), price: r.pricing.priceRupees.value, mrp: r.pricing.mrpRupees.value, img: r.media.primaryImageUrl.value ? 1 : 0 };
  } catch (e) {
    return { u: raw, ok: false, t: Date.now() - started, err: e instanceof Error ? e.message.slice(0, 80) : "error" };
  }
}

async function main() {
  const out: unknown[] = [];
  for (let i = 0; i < urls.length; i += 1) out.push(...await Promise.all(urls.slice(i, i + 1).map(run)));
  writeFileSync(outPath, JSON.stringify(out));
  console.log(`wrote ${out.length} results`);
}
main();
