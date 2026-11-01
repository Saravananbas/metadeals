import type { Deal, DealFilters } from "./types";

export function filterDeals(deals: Deal[], filters: DealFilters) {
  const words = filters.query.trim().toLocaleLowerCase("en-IN").split(/\s+/).filter(Boolean);
  const matches = deals.filter((deal) => {
    const text = `${deal.name} ${deal.brand}`.toLocaleLowerCase("en-IN");
    return words.every((word) => text.includes(word))
      && (!filters.category || deal.category === filters.category)
      && (!filters.store || deal.store === filters.store)
      && (filters.view !== "featured" || deal.featured);
  });
  return filters.view === "latest"
    ? matches.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    : matches;
}
