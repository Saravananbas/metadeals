import { demoDeals } from "./demo-data";
import { filterDeals } from "./filter";
import type { Deal } from "./types";
import type { ListingInput } from "./validation";

/** Deliberately synthetic fixtures, never inserted into the live deal database. */
export const sampleDeals: Deal[] = Array.from({ length: 50 }, (_, index) => {
  const base = demoDeals[index % demoDeals.length];
  const edition = Math.floor(index / demoDeals.length) + 1;
  return { ...base, id: `sample-${index + 1}`, source: "demo",
    name: edition === 1 ? base.name : `${base.name} · Sample ${edition}`,
    rating: null, reviewCount: null, ratingSource: null,
    price: Math.max(1, base.price - (edition - 1) * 100),
    publishedAt: new Date(Date.UTC(2026, 9, 1 + index)).toISOString(),
    featured: index % 3 === 0 };
});
export function listSampleDeals(input: ListingInput) {
  const rows = filterDeals(sampleDeals, { query: input.q, category: input.category, store: input.store,
    view: input.view === "trending" ? "top" : input.view });
  const offset = input.cursor ? rows.findIndex(d => d.id === input.cursor) + 1 : 0;
  if (input.cursor && offset === 0) return { data: [], nextCursor: null, total: rows.length };
  const data = rows.slice(offset, offset + input.limit);
  return { data, nextCursor: offset + data.length < rows.length ? data.at(-1)!.id : null, total: rows.length };
}
