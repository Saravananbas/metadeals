import { Headphones, Laptop, Smartphone, Watch } from "lucide-react";

const searches = [
  { label: "Mobiles", query: "iPhone", Icon: Smartphone },
  { label: "Headphones", query: "Headphones", Icon: Headphones },
  { label: "Smartwatches", query: "Watch", Icon: Watch },
  { label: "Laptops", query: "Laptop", Icon: Laptop },
];

export function TrendingSearches({ onSearch }: { onSearch: (query: string) => void }) {
  return <div className="trending"><span>Trending:</span><div className="trending-links">{searches.map(({ label, query, Icon }) => <button key={label} onClick={() => onSearch(query)}><Icon size={15} />{label}</button>)}</div></div>;
}
